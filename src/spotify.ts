export function validateSpotifyUrl(url: string): boolean {
  const regex = /^https:\/\/open\.spotify\.com\/(track|album|playlist|artist|show|episode)\/[a-zA-Z0-9]+/;
  return regex.test(url);
}

type SpotifyInfo = {
  type: string;
  id: string;
  valid: boolean;
};

interface CachedToken {
  token: string;
  expires: number;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

interface SpotifyTrackResponse {
  album: {
    images: SpotifyImage[];
  };
}

interface SpotifyMediaResponse {
  images: SpotifyImage[];
}


// Extract content type and ID from Spotify URL
export function extractSpotifyInfo(url: string): SpotifyInfo {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2) {
      return {
        type: pathParts[0],
        id: pathParts[1].split('?')[0], // Remove query parameters if present
        valid: true
      };
    }

    return { type: '', id: '', valid: false };
  } catch (error) {
    console.log(error)
    return { type: '', id: '', valid: false };
  }
}

// Convert regular Spotify URL to embed URL
export function convertToEmbedUrl(url: string): string {
  const info = extractSpotifyInfo(url);

  if (!info.valid) {
    throw new Error('Invalid Spotify URL format');
  }

  return `https://open.spotify.com/embed/${info.type}/${info.id}`;
}

async function getCachedToken(kv: KVNamespace): Promise<string | null> {
  const cachedData = await kv.get('spotify_token', 'json') as CachedToken | null;

  // Return the token if it exists and hasn't expired
  if (cachedData && cachedData.expires > Date.now()) {
    console.log('Using cached Spotify token');
    return cachedData.token;
  }

  console.log('No valid cached Spotify token found');
  return null;
}

// Store a token in KV with its expiration time
async function cacheToken(kv: KVNamespace, token: string, expiresIn: number): Promise<void> {
  const cachedData: CachedToken = {
    token,
    expires: Date.now() + (expiresIn * 1000) // convert seconds to milliseconds
  };

  await kv.put('spotify_token', JSON.stringify(cachedData));
  console.log('Cached new Spotify token');
}

// Get Spotify access token (from cache or fresh)
export async function getSpotifyToken(
  clientId: string,
  clientSecret: string,
  kv: KVNamespace
): Promise<string> {
  // Try to get a cached token first
  const cachedToken = await getCachedToken(kv);
  if (cachedToken) {
    return cachedToken;
  }

  // If no valid cached token exists, request a new one
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json() as SpotifyTokenResponse;

  // Cache the new token with its expiration
  await cacheToken(kv, data.access_token, data.expires_in);

  return data.access_token;
}

// Get image for a Spotify media item (unchanged from previous example)
export async function getSpotifyImage(type: string, id: string, token: string): Promise<string> {
  // Endpoints differ based on type
  let endpoint = `https://api.spotify.com/v1/${type}s/${id}`;

  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  // Image location differs based on media type
  if (type === 'track') {
    const data = await response.json() as SpotifyTrackResponse;
    return data.album.images[0]?.url || "";
  } else if (['album', 'playlist', 'artist'].includes(type)) {
    const data = await response.json() as SpotifyMediaResponse;
    return data.images[0]?.url || "";
  }

  return "";
}

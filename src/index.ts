import { Hono } from 'hono'
import { cors } from "hono/cors"
import { extractSpotifyInfo, getSpotifyToken, getSpotifyImage } from "./spotify"

type Bindings = {
  NEYNAR_API_KEY: string
  SPOTIFY_CLIENT_ID: string
  SPOTIFY_CLIENT_SECRET: string
  SPOTIFY_TOKENS: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(cors())

app.get('/feed', async (c) => {
  const limit = c.req.query('limit') || '25';
  const headers = {
    'accept': 'application/json',
    'x-api-key': c.env.NEYNAR_API_KEY,
    'x-neynar-experimental': 'false'
  };

  // Make two separate requests in parallel
  const [spotifyResponse, wholenoteResponse] = await Promise.all([
    fetch(
      `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=embed_url&embed_url=open.spotify.com&with_recasts=false&limit=${limit}`,
      { headers }
    ),
    fetch(
      `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=embed_url&embed_url=share.wholenote.live&with_recasts=false&limit=${limit}`,
      { headers }
    )
  ]);

  if (!spotifyResponse.ok || !wholenoteResponse.ok) {
    return c.json({ error: "Problem fetching feed" }, { status: 500 });
  }

  // Parse both responses
  const spotifyData = await spotifyResponse.json() as CastResponse;
  const wholenoteData = await wholenoteResponse.json() as CastResponse;

  // Combine the casts from both responses
  const allCasts = [...spotifyData.casts, ...wholenoteData.casts];

  // Sort by timestamp (newest first)
  allCasts.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  // Limit to requested number
  const limitedCasts = allCasts.slice(0, parseInt(limit));

  // Create combined response
  const combinedResponse = {
    casts: limitedCasts,
    // For pagination, you might need a more sophisticated approach
    next: spotifyData.next || wholenoteData.next
  };

  return c.json(combinedResponse, { status: 200 });
});

app.get('/', async (c) => {
  const url = c.req.query('url')
  if (!url) {
    return c.json({ error: "Missing URL" }, 400)
  }

  const { type, id, valid } = extractSpotifyInfo(url)

  if (!valid) {
    return c.json({ error: "Invalid spotify url" }, 400)
  }

  // Get token using the cached version if available
  const token = await getSpotifyToken(
    c.env.SPOTIFY_CLIENT_ID,
    c.env.SPOTIFY_CLIENT_SECRET,
    c.env.SPOTIFY_TOKENS
  );

  const imageUrl = await getSpotifyImage(type, id, token);

  const data = JSON.stringify({
    version: "next",
    imageUrl: imageUrl || "https://spotifyurl.com/image.png", // Fallback image
    button: {
      title: "Listen",
      action: {
        type: "launch_frame",
        url: `https://wholenote.live/share/${type}/${id}`,
        name: "Wholenote",
        splashImageUrl: "https://wholenote.live/spash.png",
        splashBackgroundColor: "#000000"
      }
    }
  })

  return c.html(`
    <meta name="fc:frame" content='${data}'/>
    <title>Wholenote</title>
    <meta name="description" content="Discover music shared on Farcaster">

    <meta property="og:url" content="https://wholenote.live">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Wholenote">
    <meta property="og:description" content="Discover music shared on Farcaster">
    <meta property="og:image" content="https://wholenote.live/og.png">

    <meta name="twitter:card" content="summary_large_image">
    <meta property="twitter:domain" content="wholenote.live">
    <meta property="twitter:url" content="https://wholenote.live">
    <meta name="twitter:title" content="Wholenote">
    <meta name="twitter:description" content="Discover music shared on Farcaster">
    <meta name="twitter:image" content="https://wholenote.live/og.png">
  `)
})

export default app

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
  const limit = c.req.query('limit')
  const request = await fetch(
    `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=embed_url&embed_url=open.spotify.com&with_recasts=false&limit=${limit || '25'}`,
    {
      headers: {
        'accept': 'application/json',
        'x-api-key': c.env.NEYNAR_API_KEY,
        'x-neynar-experimental': 'false'
      }
    }
  );

  if (!request.ok) {
    return c.json({ error: "Problem fetching feed" }, { status: 500 })
  }

  const response = await request.json() as CastResponse

  return c.json(response, { status: 200 })
})

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
        splashBackgroundColor: "000000"
      }
    }
  })

  return c.html(`<meta name="fc:frame" content='${data}' />`)
})

export default app

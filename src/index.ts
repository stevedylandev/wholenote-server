import { Hono } from 'hono'
import { cors } from "hono/cors"

type Bindings = {
  NEYNAR_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use(cors())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

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

export default app

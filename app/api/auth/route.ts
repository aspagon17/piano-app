import { Liveblocks } from '@liveblocks/node'

const API_KEY = process.env.LIVEBLOCKS_SECRET_KEY as string

const liveblocks = new Liveblocks({
  secret: API_KEY,
})

export async function POST(request: Request) {
  if (!API_KEY) {
    return Response.json(
      { error: 'Missing LIVEBLOCKS_SECRET_KEY' },
      { status: 403 }
    )
  }

  // Parse the request body
  const body = await request.json()
  const room = body.room

  // For the avatar example, we're generating random users
  // and set their info from the authentication endpoint
  // See https://liveblocks.io/docs/api-reference/liveblocks-node#authorize for more information
  const user = {
    id: Math.random().toString(36).slice(-6),
    info: {
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      picture: `/assets/avatars/${Math.floor(Math.random() * 10)}.png`
    }
  }

  const session = liveblocks.prepareSession(
    user.id,
    { userInfo: user.info }
  )

  // Allow access to the room
  session.allow(room, session.FULL_ACCESS)
  
  // Authorize the session
  const { status, body: responseBody } = await session.authorize()
  
  return new Response(responseBody, { status })
}

const COLORS = [
  '#f87171',
  '#fb923c',
  '#facc15',
  '#5fda15',
  '#4ade80',
  '#34ead2',
  '#22d3ee',
  '#60a5fa',
  '#c084fc',
  '#ff7dc0'
]

const NAMES = [
  'Charlie Layne',
  'Mislav Abha',
  'Tatum Paolo',
  'Anjali Wanda',
  'Jody Hekla',
  'Emil Joyce',
  'Jory Quispe',
  'Quinn Elton'
]

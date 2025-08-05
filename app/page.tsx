'use client'

import { KeyboardShortcuts, MidiNumbers, Piano } from '../components/react-piano-custom'
import 'react-piano/dist/styles.css'
import { useEffect, useState, ChangeEvent, Fragment, useRef } from 'react'
import SoundfontProvider from '../components/react-piano-custom/SoundfontProvider'
import { SongNote, SONG_DURATION, sampleSong } from '../types' // Added sampleSong import
import { motion } from 'framer-motion'
import { ClientSideSuspense } from '@liveblocks/react'
import { RoomProvider, useOthers, useSelf, useUpdateMyPresence, useStorage, useMutation } from '../liveblocks.config'
import LivePiano, { instrumentNames } from '../components/LivePiano'
import React from 'react'
import { LiveMap, LiveObject } from '@liveblocks/client'
import { Midi } from '@tonejs/midi' // New: MIDI parser
import Dropzone from 'react-dropzone' // New: For MIDI upload
import Confetti from 'react-confetti' // New: Celebration on high score

const DEFAULT_INSTRUMENT = 'piano'

/*
 * This example shows how to use Liveblocks to build a live piano app.
 * Multiple users can connect at once and play together.
 */
export default function RootPage() {
  let room: string = ''

  // If in browser, get value of ?room= from the URL
  // The room parameter is added in pages/_middleware.ts
  if (typeof window !== 'undefined') {
    room = new URLSearchParams(document.location.search).get('room') || ''
  }

  return (
    <RoomProvider
      id={'live-piano-' + room}
      initialPresence={{ instrument: DEFAULT_INSTRUMENT, notes: [] }}
      initialStorage={{ gameState: new LiveObject({ isPlaying: false, startTime: 0, scores: new LiveMap(), health: 100, combo: 0 }) }}
    >
      <ClientSideSuspense fallback={<Loading />}>
        {() => <PianoDemo />}
      </ClientSideSuspense>
    </RoomProvider>
  )
}

/*
 * The piano component is called LivePiano
 * LivePiano takes an array of NotePresence objects, one for each user
 * Add a note to `notes[]` to play it, and remove it from `notes[]` to stop it
 * Notes are in MIDI format. [52, 55, 57] will play a chord of E3, G3, A3
 */
type NotePresence = {
  instrument: string
  notes: number[]
  picture: string
  color: string
  name: string
  id: number
}

/*
 * PianoDemo is a Liveblocks wrapper around the LivePiano component
 * We're converting our presence, and others presence, into a NotePresence array
 * We then pass this array, `activeNotes`, to LivePiano
 */
function PianoDemo() {
  const updateMyPresence = useUpdateMyPresence()

  const myNotes: NotePresence = useSelf(me => ({
    ...me.info,
    ...me.presence,
    id: me.connectionId
  }))

  const othersNotes: NotePresence[] = useOthers(others =>
    others.map((other => ({
      ...other.info,
      ...other.presence,
      id: other.connectionId
    })))
  )

  const activeNotes: NotePresence[] = [myNotes, ...othersNotes]

  // Game state from storage
  const gameState = useStorage(root => root.gameState)

  // Mutations
  const startGame = useMutation(({ storage }) => {
    const game = storage.get('gameState')
    game.set('isPlaying', true)
    game.set('startTime', Date.now() + 3000) // 3s countdown
    game.set('scores', new LiveMap())
    game.set('health', 100)
    game.set('combo', 0)
  }, [])

  const endGame = useMutation(({ storage }) => {
    const game = storage.get('gameState')
    game.set('isPlaying', false)
  }, [])

  const updateScore = useMutation(({ storage, self }, delta: number) => {
    const scores = storage.get('gameState').get('scores')
    const userId = self?.id?.toString()
    scores.set(userId!, (scores.get(userId!) || 0) + delta)
  }, [])

  const updateHealth = useMutation(({ storage }, delta: number) => {
    const game = storage.get('gameState')
    let health = game.get('health') + delta
    health = Math.max(0, Math.min(100, health))
    game.set('health', health)
    if (health <= 0) endGame()
  }, [])

  const updateCombo = useMutation(({ storage }, delta: number) => {
    const game = storage.get('gameState')
    let combo = game.get('combo') + delta
    if (delta < 0) combo = 0
    game.set('combo', combo)
  }, [])

  // Tracked notes to avoid duplicate hits
  const hitNotesRef = useRef<Set<number>>(new Set()) // Local only for simplicity

  // Custom song from MIDI
  const [songNotes, setSongNotes] = useState<SongNote[]>(sampleSong)
  const [songDuration, setSongDuration] = useState(SONG_DURATION)
  const [songName, setSongName] = useState('Sample Song')

  // Handle MIDI upload
  const handleMidiUpload = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const arrayBuffer = await file.arrayBuffer()
    const midi = new Midi(arrayBuffer)
    const notes: SongNote[] = []
    midi.tracks.forEach(track => {
      track.notes.forEach(note => {
        notes.push({ note: note.midi, time: note.time * 1000 }) // Convert seconds to ms
      })
    })
    notes.sort((a, b) => a.time - b.time)
    setSongNotes(notes)
    setSongDuration(midi.duration * 1000 + 2000) // Buffer for last notes
    setSongName(file.name.replace('.mid', ''))
  }

  // Game loop: Miss detection, health drain, and end game
  useEffect(() => {
    if (!gameState?.isPlaying) return
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - gameState.startTime
      if (elapsed > songDuration) {
        endGame()
        return
      }
      // Check misses
      songNotes.forEach((songNote) => {
        if (elapsed > songNote.time + 300 && !hitNotesRef.current.has(songNote.time)) { // 300ms miss window
          updateScore(-20) // Miss penalty
          updateHealth(-5) // Drain health
          updateCombo(-1) // Reset combo
          hitNotesRef.current.add(songNote.time) // Mark as missed
        }
      })
    }, 100)
    return () => clearInterval(interval)
  }, [gameState, songNotes, songDuration])

  // Reset hits on game start
  useEffect(() => {
    if (gameState?.isPlaying) {
      hitNotesRef.current.clear()
    }
  }, [gameState?.isPlaying])

  // When local user plays a note, add note (if not already being played) and update myPresence
  function handlePlayNote(note: number) {
    if (!myNotes.notes.includes(note)) {
      const myNewNotes = [...myNotes.notes, note]
      updateMyPresence({ notes: myNewNotes })
    }

    if (gameState?.isPlaying) {
      const elapsed = Date.now() - gameState.startTime
      const perfectWindow = 100 // ms for perfect
      const goodWindow = 200 // ms for good
      const hitNote = songNotes.find((n) => Math.abs(n.time - elapsed) < goodWindow && n.note === note)
      if (hitNote && !hitNotesRef.current.has(hitNote.time)) {
        const timingError = Math.abs(hitNote.time - elapsed)
        let points = 50 // Miss by default
        if (timingError < perfectWindow) {
          points = 100 // Perfect
          // TODO: Add green flash effect
        } else {
          points = 50 // Good
          // TODO: Add yellow flash
        }
        updateScore(points * (1 + Math.floor(gameState.combo / 10))) // Multiplier based on combo
        updateCombo(1)
        updateHealth(2) // Small health boost on hit
        hitNotesRef.current.add(hitNote.time)
      } else {
        updateScore(-10) // Wrong press
        updateCombo(-1)
        updateHealth(-2)
        // TODO: Red flash on wrong
      }
    }
  }

  // When local user releases a note, remove note and update myPresence
  function handleStopNote(note: number) {
    const myNewNotes = myNotes.notes.filter(n => n !== note)
    updateMyPresence({ notes: myNewNotes })
  }

  // Change local user's instrument
  function handleInstrumentChange(e: ChangeEvent<HTMLSelectElement>) {
    updateMyPresence({ instrument: e.target.value })
  }

  const isGameOver = gameState && !gameState.isPlaying && (Date.now() - (gameState.startTime || 0) > songDuration)
  const myScore = gameState?.scores?.get(myNotes.id.toString()) || 0
  const highScore = parseInt(localStorage.getItem('highScore') || '0', 10) // Parse to number
  if (isGameOver && myScore > highScore) localStorage.setItem('highScore', myScore.toString())

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex justify-center items-center relative overflow-hidden">
      {/* Animated cosmic background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* MIDI Uploader */}
      {!gameState?.isPlaying && !isGameOver && (
        <Dropzone onDrop={handleMidiUpload} accept={{ 'audio/midi': ['.mid', '.midi'] }}>
          {({ getRootProps, getInputProps }) => (
            <div {...getRootProps()} className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 z-30 cursor-pointer">
              <input {...getInputProps()} />
              Upload MIDI Song
            </div>
          )}
        </Dropzone>
      )}

      {/* Song Title */}
      <h2 className="absolute top-20 left-1/2 transform -translate-x-1/2 text-white text-3xl font-bold z-30">{songName}</h2>

      {/* Start Button */}
      {!gameState?.isPlaying && !isGameOver && songNotes.length > 0 && (
        <button
          onClick={startGame}
          className="absolute top-32 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-8 py-4 rounded-xl font-bold shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 z-30"
        >
          Start Game
        </button>
      )}

      {/* Falling Notes Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-10">
        {gameState?.isPlaying && songNotes.map((songNote: SongNote, i) => {
          const elapsed = Date.now() - gameState.startTime
          const fallDuration = 5 // seconds to fall (adjust speed)
          const position = ((songNote.time - elapsed) / 1000) / fallDuration // 0 to 1 (top to bottom)
          if (position > -0.2 && position < 1.2) { // Slightly extended visibility
            const keyIndex = songNote.note - MidiNumbers.fromNote('c3') // Adjust for your note range
            const keyWidth = 1000 / 25 // Approx, adjust for your piano width / num keys
            return (
              <motion.div
                key={i}
                initial={{ y: '-100%', opacity: 0 }}
                animate={{ y: '100%', opacity: 1 }}
                transition={{ duration: fallDuration, ease: 'linear', delay: position * -fallDuration }}
                style={{ left: `${keyIndex * keyWidth}px`, width: `${keyWidth * 0.8}px` }} // Slightly narrower for style
                className="absolute h-8 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-full shadow-lg filter blur-sm opacity-80"
              >
                {/* Glowing trail */}
                <div className="absolute inset-0 bg-cyan-300 rounded-full animate-pulse opacity-50" />
              </motion.div>
            )
          }
          return null
        })}
      </div>

      {/* Hit Zone Indicator */}
      <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-blue-500/20 to-transparent z-10" />

      {/* Scores/Combo/Health Display */}
      <div className="absolute top-8 right-8 bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-white/20 z-30">
        <h3 className="text-white font-bold text-lg mb-3">Score: {myScore}</h3>
        <p className="text-white/90">Combo: {gameState?.combo || 0}x</p>
        <p className="text-white/90">Health:</p>
        <div className="w-32 h-2 bg-red-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-300"
            style={{ width: `${gameState?.health || 100}%` }}
          />
        </div>
      </div>

      {/* Game Over Screen with Confetti */}
      {isGameOver && (
        <>
          {myScore > highScore && <Confetti width={window.innerWidth} height={window.innerHeight} />}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center z-40"
          >
            <h2 className="text-5xl font-bold text-white mb-6 animate-bounce">Game Over!</h2>
            <p className="text-2xl text-white/80 mb-4">Your Score: {myScore}</p>
            <p className="text-xl text-yellow-400 mb-8">High Score: {Math.max(myScore, highScore)}</p>
            <button
              onClick={() => location.reload()} // Restart
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-4 rounded-xl font-bold shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
            >
              Play Again
            </button>
          </motion.div>
        </>
      )}

      {/* Piano UI */}
      <div className="flex flex-col drop-shadow-2xl z-20 animate-slide-up absolute bottom-0 w-full max-w-6xl">
        <div className="bg-white/10 backdrop-blur-md mb-[2px] flex justify-end rounded-t-2xl overflow-hidden border border-white/20 border-b-0">
          <div className="p-6 pr-0 sm:pr-6 flex flex-grow">
            <Avatar url={myNotes?.picture} color={myNotes?.color} />
            <div className="ml-3">
              <div className="font-semibold text-white">You</div>
              <SelectInstrument onInstrumentChange={handleInstrumentChange} />
            </div>
          </div>
          {othersNotes.reverse().map(({ picture, name, color, instrument, id }) => (
            <Fragment key={id}>
              <motion.div className="py-6 px-4 xl:px-6 first:pl-6 last:pr-6 hidden lg:flex opacity-0" animate={{ y: [-100, 0], opacity: [0, 1] }}>
                <Avatar url={picture} color={color} />
                <div className="ml-3">
                  <div className="font-semibold text-white">{name}</div>
                  <div className="text-white/70">{capitalize(instrument)}</div>
                </div>
              </motion.div>
              <div className="flex lg:hidden justify-center items-center last:pr-6">
                <Avatar url={picture} color={color} />
              </div>
            </Fragment>
          ))}
        </div>
        <div className="relative rounded-b-2xl overflow-hidden bg-gradient-to-b from-gray-900 to-black p-4">
          <LivePiano
            activeNotes={activeNotes}
            onPlayNote={handlePlayNote}
            onStopNote={handleStopNote}
            defaultInstrument={DEFAULT_INSTRUMENT}
          />
        </div>
      </div>
      <motion.div
        animate={{ opacity: [1, 0] }}
        transition={{ transitionEnd: { display: 'none' } }}
        className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 z-30"
      />
    </div>
  )
}

// HTML select element, for instrument selection
function SelectInstrument({ onInstrumentChange }: { onInstrumentChange: (event: ChangeEvent<HTMLSelectElement>) => void }) {
  const select = useRef<HTMLSelectElement>(null)

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    select.current?.blur()
    onInstrumentChange(event)
  }

  return (
    <div className="relative">
      <span className="absolute top-0.5 -left-1 flex items-center pr-2 pointer-events-none">
        <svg className="h-5 w-5 text-white/50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
      <select
        ref={select}
        onChange={handleChange}
        defaultValue={DEFAULT_INSTRUMENT}
        className="outline-0 rounded-md bg-white/10 hover:bg-white/20 text-white/70 hover:text-white border border-white/10 hover:border-white/20 focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer mt-0.5 appearance-none w-full px-4 py-0.5 -mt-1.5 transition-all duration-200"
      >
        {instrumentNames.map(instrument => (
          <option key={instrument} value={instrument} className="bg-gray-800 text-white">
            {capitalize(instrument)}
          </option>
        ))}
      </select>
    </div>
  )
}

function Avatar({ url = '', color = '' }) {
  return (
    <span className="inline-block relative">
      <img
        className="h-12 w-12 rounded-full ring-4 ring-white"
        src={url}
        alt=""
      />
      <span style={{ backgroundColor: color }} className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white" />
    </span>
  )
}

function Loading() {
  return (
    <div className="bg-gray-100 w-full h-full flex justify-center items-center">
      <span>Connecting...</span>
    </div>
  )
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

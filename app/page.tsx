'use client'

import { KeyboardShortcuts, MidiNumbers, Piano } from '../components/react-piano-custom'
import 'react-piano/dist/styles.css'
import { useEffect, useState, ChangeEvent, Fragment, useRef } from 'react'
import SoundfontProvider from '../components/react-piano-custom/SoundfontProvider'
import { SongNote, sampleSong, SONG_DURATION } from '../types'
import { motion } from 'framer-motion'
import { ClientSideSuspense } from '@liveblocks/react'
import { RoomProvider, useOthers, useSelf, useUpdateMyPresence, useStorage, useMutation } from '../liveblocks.config'
import LivePiano, { instrumentNames } from '../components/LivePiano'
import React from 'react'
import { LiveMap, LiveObject } from '@liveblocks/client'

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
      initialStorage={{ gameState: new LiveObject({ isPlaying: false, startTime: 0, scores: new LiveMap() }) }}
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

  // Tracked notes to avoid duplicate hits
  const hitNotesRef = useRef<Set<number>>(new Set()) // Local only for simplicity

  // Game loop: Miss detection and end game
  useEffect(() => {
    if (!gameState?.isPlaying) return
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - gameState.startTime
      if (elapsed > SONG_DURATION) {
        endGame()
        return
      }
      // Check misses
      sampleSong.forEach((songNote) => {
        if (elapsed > songNote.time + 300 && !hitNotesRef.current.has(songNote.time)) { // 300ms miss window
          updateScore(-20) // Miss penalty
          hitNotesRef.current.add(songNote.time) // Mark as missed
        }
      })
    }, 100)
    return () => clearInterval(interval)
  }, [gameState])

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
      const timingWindow = 200 // ms for perfect
      const hitNote = sampleSong.find((n) => Math.abs(n.time - elapsed) < timingWindow && n.note === note)
      if (hitNote && !hitNotesRef.current.has(hitNote.time)) {
        updateScore(100) // Perfect
        hitNotesRef.current.add(hitNote.time)
      } else {
        updateScore(-10) // Wrong press
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

  const isGameOver = gameState && !gameState.isPlaying && (Date.now() - (gameState.startTime || 0) > SONG_DURATION)

  console.log("gameState", gameState)
  console.log("gameState.isPlaying", gameState?.isPlaying)
  console.log("isGameOver", isGameOver)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex justify-center items-center relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Start Button */}
      {!gameState?.isPlaying && !isGameOver && (
        <button 
          onClick={startGame} 
          className="absolute top-8 left-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 z-30"
        >
          Start Game
        </button>
      )}

      {/* Falling Notes Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-10">
        {gameState?.isPlaying && sampleSong.map((songNote: SongNote, i) => {
          const elapsed = Date.now() - gameState.startTime
          const fallDuration = 5 // seconds to fall
          const position = ((songNote.time - elapsed) / 1000) / fallDuration // 0 to 1 (top to bottom)
          if (position > -1 && position < 1) { // Visible
            const keyIndex = songNote.note - MidiNumbers.fromNote('c3') // Adjust for note range
            const keyWidth = 1000 / 25 // Approx, adjust for your piano width / num keys
            return (
              <motion.div
                key={i}
                initial={{ y: '-100%' }}
                animate={{ y: '100%' }}
                transition={{ duration: fallDuration, ease: 'linear', delay: position * -fallDuration }}
                style={{ left: `${keyIndex * keyWidth}px`, width: `${keyWidth}px` }}
                className="absolute h-4 bg-gradient-to-b from-blue-400 to-blue-600 rounded-full shadow-lg"
              />
            )
          }
          return null
        })}
      </div>

      {/* Scores Display */}
      <div className="absolute top-8 right-8 bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-white/20 z-30">
        <h3 className="text-white font-bold text-lg mb-3">Scores</h3>
        <div className="space-y-2">
          {gameState && Array.from(gameState.scores.entries()).map(([userId, score]) => (
            <div key={userId} className="flex justify-between items-center text-white/90">
              <span className="font-medium">{userId === myNotes?.id?.toString() ? 'You' : `Player ${userId}`}</span>
              <span className="font-bold ml-4">{score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Game Over Screen */}
      {isGameOver && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-40"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-purple-900/90 to-pink-900/90 p-12 rounded-3xl shadow-2xl border border-white/20 text-center"
          >
            <h2 className="text-4xl font-bold text-white mb-6">Game Over!</h2>
            <p className="text-xl text-white/80">Check the final scores above</p>
          </motion.div>
        </motion.div>
      )}

      {/* Existing piano UI */}
      <div className="flex flex-col drop-shadow-2xl z-20 animate-slide-up">
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
        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-30"
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

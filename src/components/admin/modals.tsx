'use client'

import { useRef } from 'react'
import { X, AlertCircle, Grid3x3 } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ open, onClose, children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>
  )
}

interface OpenRoundModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  roundName: string
  classCount: number
  loading: boolean
}

export function OpenRoundModal({
  open,
  onClose,
  onConfirm,
  roundName,
  classCount,
  loading,
}: OpenRoundModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-lg font-bold text-gray-900">Open this round?</h2>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-900">
            Opening <span className="font-bold">{roundName}</span> will create{' '}
            <span className="font-bold">{classCount} empty workshops</span> — one per
            participating class. Teachers will be notified to confirm availability.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Grid3x3 className="size-5 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-900">Participating classes</p>
            <p className="text-xs text-gray-500">
              {classCount} classes across all active schools will be included.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-[#1e2a4a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e] disabled:opacity-50"
        >
          {loading ? 'Opening…' : `Open round & create ${classCount} workshops`}
        </button>
      </div>
    </Modal>
  )
}

interface RoundOpenedModalProps {
  open: boolean
  onClose: () => void
  roundName: string
  workshopCount: number
}

export function RoundOpenedModal({
  open,
  onClose,
  roundName,
  workshopCount,
}: RoundOpenedModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100">
          <svg className="size-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-bold text-gray-900">Round opened</h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-semibold">{roundName}</span> is live
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {workshopCount} empty workshops were created. Teachers can now confirm their availability
          for the round.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onClose}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
          <a
            href="/admin/schedule"
            className="rounded-lg bg-[#1e2a4a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            View workshops
          </a>
        </div>
      </div>
    </Modal>
  )
}

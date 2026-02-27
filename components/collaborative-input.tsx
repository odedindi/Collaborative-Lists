'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A text input bound to a Y.Text instance for real-time collaborative editing.
 * Shows a colored label when another user is editing the same field.
 */

interface CollaborativeInputProps {
  yText: Y.Text | null
  placeholder?: string
  className?: string
  readOnly?: boolean
  fallbackValue?: string
  onFallbackChange?: (value: string) => void
  editingUser?: { name: string; color: string } | null
}

export function CollaborativeInput({
  yText,
  placeholder,
  className,
  readOnly = false,
  fallbackValue = '',
  onFallbackChange,
  editingUser,
}: CollaborativeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const isLocalChangeRef = useRef(false)

  // Sync from Y.Text to local state
  useEffect(() => {
    if (!yText) {
      setValue(fallbackValue)
      return
    }

    setValue(yText.toString())

    const observer = () => {
      if (!isLocalChangeRef.current) {
        setValue(yText.toString())
      }
      isLocalChangeRef.current = false
    }

    yText.observe(observer)
    return () => yText.unobserve(observer)
  }, [yText, fallbackValue])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value

      if (!yText) {
        setValue(newVal)
        onFallbackChange?.(newVal)
        return
      }

      isLocalChangeRef.current = true

      // Compute diff and apply to Y.Text
      const oldVal = yText.toString()
      yText.doc?.transact(() => {
        // Simple diff: delete all, insert new
        // A smarter diff could be used, but this works for single-line inputs
        if (oldVal.length > 0) {
          yText.delete(0, oldVal.length)
        }
        if (newVal.length > 0) {
          yText.insert(0, newVal)
        }
      })
      setValue(newVal)
    },
    [yText, onFallbackChange]
  )

  return (
    <div className="relative">
      {editingUser && (
        <div
          className="absolute -top-5 left-1 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium text-card shadow-sm"
          style={{ backgroundColor: editingUser.color }}
        >
          {editingUser.name}
        </div>
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cn(
          'transition-all',
          editingUser && 'ring-2',
          readOnly && 'cursor-default bg-secondary text-secondary-foreground',
          className
        )}
        style={editingUser ? { borderColor: editingUser.color, boxShadow: `0 0 0 1px ${editingUser.color}` } : undefined}
      />
    </div>
  )
}

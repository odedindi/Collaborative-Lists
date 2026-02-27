'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Item, Field, PresenceUser } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Trash2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ListItemCardProps {
  item: Item
  schema: Field[]
  isViewer: boolean
  onToggle: (id: string, checked: boolean) => void
  onFieldChange: (id: string, fieldId: string, value: any) => void
  onDelete: (id: string) => void
  activeEditors?: { fieldId: string; user: PresenceUser }[]
}

export function ListItemCard({
  item,
  schema,
  isViewer,
  onToggle,
  onFieldChange,
  onDelete,
  activeEditors = [],
}: ListItemCardProps) {
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const debouncedFieldChange = useCallback(
    (fieldId: string, value: any) => {
      if (debounceTimers.current[fieldId]) {
        clearTimeout(debounceTimers.current[fieldId])
      }
      debounceTimers.current[fieldId] = setTimeout(() => {
        onFieldChange(item.id, fieldId, value)
      }, 300)
    },
    [item.id, onFieldChange]
  )

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])

  const getEditorForField = (fieldId: string) => {
    return activeEditors.find((e) => e.fieldId === fieldId)
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border bg-card p-3 transition-all duration-300',
        item.checked
          ? 'border-border/50 opacity-50'
          : 'border-border hover:border-primary/20 hover:shadow-sm'
      )}
    >
      <div className="flex items-start gap-3">
        {!isViewer && (
          <div className="flex items-center pt-1">
            <Checkbox
              checked={item.checked}
              onCheckedChange={(checked) => onToggle(item.id, !!checked)}
              className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2">
          {schema.map((field) => {
            const value = item.fields[field.id]
            const editor = getEditorForField(field.id)

            return (
              <div key={field.id} className="relative flex flex-col gap-0.5">
                {editor && (
                  <div className="absolute -top-4 left-0 z-10 flex items-center gap-1">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: editor.user.color }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: editor.user.color }}>
                      {editor.user.name}
                    </span>
                  </div>
                )}

                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {field.label}
                </label>

                {field.type === 'text' && (
                  isViewer ? (
                    <span className={cn('text-sm text-card-foreground', item.checked && 'line-through')}>
                      {value || ''}
                    </span>
                  ) : (
                    <Input
                      defaultValue={value || ''}
                      onChange={(e) => debouncedFieldChange(field.id, e.target.value)}
                      placeholder={field.label}
                      className={cn(
                        'h-8 text-sm bg-background border-input text-foreground placeholder:text-muted-foreground',
                        item.checked && 'line-through',
                        editor && 'ring-1',
                      )}
                      style={editor ? { borderColor: editor.user.color } : undefined}
                    />
                  )
                )}

                {field.type === 'number' && (
                  isViewer ? (
                    <span className="text-sm text-card-foreground">{value ?? ''}</span>
                  ) : (
                    <Input
                      type="number"
                      defaultValue={value ?? ''}
                      onChange={(e) => debouncedFieldChange(field.id, e.target.value ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="h-8 w-24 text-sm bg-background border-input text-foreground"
                    />
                  )
                )}

                {field.type === 'checkbox' && (
                  <Checkbox
                    checked={!!value}
                    disabled={isViewer}
                    onCheckedChange={(checked) => onFieldChange(item.id, field.id, !!checked)}
                    className="border-input"
                  />
                )}

                {field.type === 'select' && (
                  isViewer ? (
                    <span className="text-sm text-card-foreground">{value || '-'}</span>
                  ) : (
                    <Select
                      value={value || ''}
                      onValueChange={(v) => onFieldChange(item.id, field.id, v)}
                    >
                      <SelectTrigger className="h-8 text-sm bg-background text-foreground">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                )}
              </div>
            )
          })}
        </div>

        {!isViewer && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            className="h-8 w-8 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete item</span>
          </Button>
        )}
      </div>

      {isViewer && item.checked && (
        <div className="absolute inset-0 rounded-xl pointer-events-none">
          <div className="absolute top-1/2 left-4 right-4 h-px bg-muted-foreground/30" />
        </div>
      )}
    </div>
  )
}

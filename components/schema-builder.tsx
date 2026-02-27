'use client'

import { useState } from 'react'
import { LIST_TEMPLATES, generateId, type Field } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  X,
  ShoppingCart,
  Briefcase,
  Mountain,
  CheckSquare,
  ArrowRight,
  Loader2,
} from 'lucide-react'

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  'Grocery List': <ShoppingCart className="h-5 w-5" />,
  'Packing List': <Briefcase className="h-5 w-5" />,
  'Gear List': <Mountain className="h-5 w-5" />,
  'To-do': <CheckSquare className="h-5 w-5" />,
}

interface SchemaBuilderProps {
  onSubmit: (name: string, schema: Field[]) => Promise<void>
  onCancel: () => void
}

export function SchemaBuilder({ onSubmit, onCancel }: SchemaBuilderProps) {
  const [step, setStep] = useState<'template' | 'custom'>('template')
  const [name, setName] = useState('')
  const [fields, setFields] = useState<Field[]>([])
  const [loading, setLoading] = useState(false)

  function selectTemplate(template: typeof LIST_TEMPLATES[number]) {
    setName(template.name)
    setFields(template.schema)
    setStep('custom')
  }

  function addField() {
    setFields([...fields, { id: generateId(), label: '', type: 'text' }])
  }

  function updateField(index: number, updates: Partial<Field>) {
    const updated = [...fields]
    updated[index] = { ...updated[index], ...updates }
    setFields(updated)
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index))
  }

  function addOption(fieldIndex: number) {
    const field = fields[fieldIndex]
    const options = [...(field.options || []), '']
    updateField(fieldIndex, { options })
  }

  function updateOption(fieldIndex: number, optIndex: number, value: string) {
    const field = fields[fieldIndex]
    const options = [...(field.options || [])]
    options[optIndex] = value
    updateField(fieldIndex, { options })
  }

  function removeOption(fieldIndex: number, optIndex: number) {
    const field = fields[fieldIndex]
    const options = (field.options || []).filter((_, i) => i !== optIndex)
    updateField(fieldIndex, { options })
  }

  async function handleSubmit() {
    if (!name.trim() || fields.length === 0) return
    setLoading(true)
    try {
      await onSubmit(name.trim(), fields)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'template') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">New List</h2>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
            Cancel
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">Start from a template or build your own</p>

        <div className="grid grid-cols-2 gap-3">
          {LIST_TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => selectTemplate(t)}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground transition-all hover:border-primary/30 hover:bg-secondary active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                {TEMPLATE_ICONS[t.name]}
              </div>
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.schema.length} fields</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setStep('custom')}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Custom list
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {name || 'Custom List'}
        </h2>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
          Cancel
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="listName" className="text-sm font-medium text-foreground">List name</label>
        <Input
          id="listName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My awesome list"
          className="h-10 bg-background border-input text-foreground"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Fields</label>
          <Button variant="outline" size="sm" onClick={addField} className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" /> Add field
          </Button>
        </div>

        {fields.map((field, i) => (
          <Card key={field.id} className="border-border bg-card">
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Field name"
                  className="h-8 flex-1 text-sm bg-background text-foreground"
                />
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(i, { type: v as Field['type'], options: v === 'select' ? [''] : undefined })}
                >
                  <SelectTrigger className="h-8 w-28 text-xs bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeField(i)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {field.type === 'select' && (
                <div className="flex flex-col gap-1.5 pl-2">
                  <span className="text-xs text-muted-foreground">Options</span>
                  {(field.options || []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(i, oi, e.target.value)}
                        placeholder={`Option ${oi + 1}`}
                        className="h-7 flex-1 text-xs bg-background text-foreground"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(i, oi)}
                        className="h-7 w-7 p-0 text-muted-foreground"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addOption(i)}
                    className="h-7 text-xs text-muted-foreground self-start"
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add option
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {fields.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Add at least one field to your list
          </div>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={loading || !name.trim() || fields.length === 0}
        className="h-11 gap-2 bg-primary text-primary-foreground"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Create list
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  )
}

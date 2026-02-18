'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface IndustrySchema {
  industry_key: string
  display_name: string
  service_taxonomy: Record<string, unknown>
  fee_breakdown_schema: FeeBreakdownSchema
  context_schema: ContextSchema
  validation_rules: ValidationRules
  version: number
  is_active: boolean
}

export interface FeeBreakdownSchema {
  type: string
  required?: string[]
  properties: Record<string, SchemaProperty>
  additionalProperties?: boolean
}

export interface ContextSchema {
  type: string
  required?: string[]
  properties: Record<string, SchemaProperty>
  additionalProperties?: boolean
}

export interface SchemaProperty {
  type: string
  title?: string
  description?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  items?: SchemaProperty
  properties?: Record<string, SchemaProperty>
}

export interface ValidationRules {
  pricing_model_required_fields?: Record<string, string[]>
  conditional_requires_pct_disclosure?: {
    pricing_model: string
    require_any: string[]
    error: string
  }
  matter_type_context_hints?: Record<string, string[]>
  transparency_scoring?: {
    positive_signals?: string[]
    negative_signals?: string[]
  }
}

export interface ServiceOption {
  key: string
  label: string
}

/**
 * ✅ 关键修复点：
 * 1) 给缓存条目单独命名类型，避免推断漂移
 * 2) Map 显式泛型化（你原来其实已有，但在闭包里仍会出问题）
 */
type SchemaCacheEntry = {
  data: IndustrySchema
  fetchedAt: number
  version: number
}

const schemaCache: Map<string, SchemaCacheEntry> = new Map()
const CACHE_TTL = 5 * 60 * 1000

export function useIndustrySchema(industryKey: string | null) {
  const [schema, setSchema] = useState<IndustrySchema | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSchema = useCallback(async (key: string) => {
    const cached = schemaCache.get(key)

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setSchema(cached.data)

      // ✅ 闭包里不要继续使用外层 cached（TS 会失去窄化）
      // 直接重新从 cache 取一次，并加显式类型守卫
      const supabase = createClient()
      supabase
        .from('industry_schemas')
        .select('version')
        .eq('industry_key', key)
        .eq('is_active', true)
        .single()
        .then(({ data }) => {
          const latest = schemaCache.get(key)
          const serverVersion = (data as { version?: number } | null)?.version

          if (latest && typeof serverVersion === 'number' && serverVersion !== latest.version) {
            schemaCache.delete(key)
            // 重新拉取最新 schema（不 await，避免阻塞 UI）
            fetchSchema(key)
          }
        })

      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('industry_schemas')
        .select('*')
        .eq('industry_key', key)
        .eq('is_active', true)
        .single()

      if (fetchError || !data) {
        setError(fetchError?.message || 'Schema not found')
        setSchema(null)
        return
      }

      const schemaData = data as IndustrySchema
      schemaCache.set(key, { data: schemaData, fetchedAt: Date.now(), version: schemaData.version })
      setSchema(schemaData)
    } catch {
      setError('Failed to load schema')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (industryKey) {
      fetchSchema(industryKey)
    } else {
      setSchema(null)
    }
  }, [industryKey, fetchSchema])

  return { schema, loading, error }
}

export function useIndustryList() {
  const [industries, setIndustries] = useState<{ key: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const { data } = await supabase
        .from('industry_schemas')
        .select('industry_key, display_name')
        .eq('is_active', true)
        .order('display_name')

      if (data) {
        setIndustries(
          data.map((d: { industry_key: string; display_name: string }) => ({
            key: d.industry_key,
            name: d.display_name,
          }))
        )
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { industries, loading }
}

export function getServiceOptions(schema: IndustrySchema): ServiceOption[] {
  const taxonomy = schema.service_taxonomy
  if (!taxonomy) return []
  const types = (taxonomy.matter_types || taxonomy.services || []) as Array<{ key: string; label: string }>
  return types.map((t) => ({ key: t.key, label: t.label }))
}

export function getRequiredFieldsForPricingModel(schema: IndustrySchema, pricingModel: string): string[] {
  const rules = schema.validation_rules?.pricing_model_required_fields
  if (!rules) return []
  return rules[pricingModel] || []
}

export function getRecommendedContextFields(schema: IndustrySchema, matterType: string): string[] {
  const hints = schema.validation_rules?.matter_type_context_hints
  if (!hints) return []
  return hints[matterType] || []
}
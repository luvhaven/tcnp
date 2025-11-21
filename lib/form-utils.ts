/**
 * Form Utilities - Standardized error handling and logging for forms
 */

import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface FormSubmitOptions<T = any> {
  supabase: SupabaseClient
  table: string
  data: T
  editingId?: string | null
  onSuccess?: (result: any) => void
  onError?: (error: any) => void
  successMessage?: string
  errorMessage?: string
  transformData?: (data: T) => any
}

/**
 * Standardized form submission handler with enhanced error logging
 * 
 * @example
 * ```typescript
 * await handleFormSubmit({
 *   supabase,
 *   table: 'papas',
 *   data: formData,
 *   editingId: editingPapa?.id,
 *   onSuccess: () => {
 *     setDialogOpen(false)
 *     loadPapas()
 *   },
 *   transformData: (data) => ({
 *     ...data,
 *     speaking_schedule: data.speaking_schedule || []
 *   })
 * })
 * ```
 */
export async function handleFormSubmit<T = any>({
  supabase,
  table,
  data,
  editingId,
  onSuccess,
  onError,
  successMessage,
  errorMessage,
  transformData
}: FormSubmitOptions<T>): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    console.log(`📝 Form data received for ${table}:`, data)
    
    // Transform data if transformer provided
    const finalData = transformData ? transformData(data) : data
    
    console.log(`💾 Data to save to ${table}:`, finalData)

    if (editingId) {
      // UPDATE operation
      const { data: result, error } = await supabase
        .from(table)
        .update(finalData)
        .eq('id', editingId)
        .select()

      if (error) {
        console.error(`❌ Supabase update error on ${table}:`, error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        throw error
      }
      
      console.log(`✅ ${table} updated:`, result)
      toast.success(successMessage || `${capitalize(table)} updated successfully!`)
      
      if (onSuccess) onSuccess(result)
      return { success: true, data: result }
    } else {
      // INSERT operation
      const { data: result, error } = await supabase
        .from(table)
        .insert([finalData])
        .select()

      if (error) {
        console.error(`❌ Supabase insert error on ${table}:`, error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        throw error
      }
      
      console.log(`✅ ${table} created:`, result)
      toast.success(successMessage || `${capitalize(table)} added successfully!`)
      
      if (onSuccess) onSuccess(result)
      return { success: true, data: result }
    }
  } catch (error: any) {
    console.error(`❌ Error saving ${table}:`, error)
    console.error('Error type:', typeof error)
    console.error('Error keys:', Object.keys(error || {}))
    
    const message = error.message || error.hint || error.details || errorMessage || `Failed to save ${table}`
    toast.error(message)
    
    if (onError) onError(error)
    return { success: false, error }
  }
}

/**
 * Standardized form deletion handler with enhanced error logging
 */
export async function handleFormDelete({
  supabase,
  table,
  id,
  onSuccess,
  onError,
  successMessage,
  errorMessage,
  confirmMessage
}: {
  supabase: SupabaseClient
  table: string
  id: string
  onSuccess?: () => void
  onError?: (error: any) => void
  successMessage?: string
  errorMessage?: string
  confirmMessage?: string
}): Promise<{ success: boolean; error?: any }> {
  const confirmed = confirm(confirmMessage || `Are you sure you want to delete this ${table}?`)
  if (!confirmed) return { success: false }

  try {
    console.log(`🗑️ Deleting ${table} with id:`, id)
    
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id)

    if (error) {
      console.error(`❌ Supabase delete error on ${table}:`, error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      throw error
    }
    
    console.log(`✅ ${table} deleted successfully`)
    toast.success(successMessage || `${capitalize(table)} deleted successfully!`)
    
    if (onSuccess) onSuccess()
    return { success: true }
  } catch (error: any) {
    console.error(`❌ Error deleting ${table}:`, error)
    
    const message = error.message || error.hint || error.details || errorMessage || `Failed to delete ${table}`
    toast.error(message)
    
    if (onError) onError(error)
    return { success: false, error }
  }
}

/**
 * Validate required fields before submission
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  const missingFields = requiredFields.filter(field => {
    const value = data[field]
    return value === undefined || value === null || value === ''
  })

  if (missingFields.length > 0) {
    console.warn('⚠️ Missing required fields:', missingFields)
    toast.error(`Please fill in required fields: ${missingFields.join(', ')}`)
    return { valid: false, missingFields }
  }

  return { valid: true, missingFields: [] }
}

/**
 * Capitalize first letter of string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Format Supabase error for display
 */
export function formatSupabaseError(error: any): string {
  if (!error) return 'An unknown error occurred'
  
  // Check for common error patterns
  if (error.code === '23505') {
    return 'This record already exists. Please use a different value.'
  }
  
  if (error.code === '23503') {
    return 'Cannot delete this record because it is referenced by other records.'
  }
  
  if (error.code === '42P01') {
    return 'Database table not found. Please contact support.'
  }
  
  if (error.code === '42501') {
    return 'You do not have permission to perform this action.'
  }
  
  // Return the most informative message available
  return error.message || error.hint || error.details || 'An error occurred'
}

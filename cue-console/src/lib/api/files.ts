import { createClient } from '@/lib/supabase/client'
import { createHash } from 'crypto'

export interface FileRecord {
  id: string
  sha256: string
  storage_path: string
  filename: string
  mime_type: string
  size_bytes: number
  uploaded_by_type: 'human' | 'agent'
  uploaded_by_id: string
  created_at: string
}

async function calculateSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hash = createHash('sha256')
  hash.update(Buffer.from(buffer))
  return hash.digest('hex')
}

export async function uploadFile(file: File) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')
  
  const sha256 = await calculateSHA256(file)
  
  const { data: existing } = await supabase
    .from('files')
    .select('*')
    .eq('sha256', sha256)
    .single()
  
  if (existing) {
    return existing as FileRecord
  }
  
  const storagePath = `${user.id}/${Date.now()}_${file.name}`
  
  const { error: uploadError } = await supabase.storage
    .from('cue-files')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    })
  
  if (uploadError) throw uploadError
  
  const { data: fileRecord, error: dbError } = await supabase
    .from('files')
    .insert({
      sha256,
      storage_path: storagePath,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by_type: 'human',
      uploaded_by_id: user.id,
    })
    .select()
    .single()
  
  if (dbError) throw dbError
  
  return fileRecord as FileRecord
}

export async function getFileUrl(path: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase.storage
    .from('cue-files')
    .createSignedUrl(path, 3600)
  
  if (error) throw error
  return data.signedUrl
}

export async function deleteFile(path: string) {
  const supabase = createClient()
  
  const { error } = await supabase.storage
    .from('cue-files')
    .remove([path])
  
  if (error) throw error
}

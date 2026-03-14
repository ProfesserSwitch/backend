import { createClient } from '@supabase/supabase-js'

// 💡 เอาค่ามาจากหน้า Project Settings > API ใน Supabase
const supabaseUrl = 'https://supabase.com/dashboard/project/qsopjsioqmqtyaocqmmx.supabase.co' 
const supabaseKey = 'sb_publishable_aH637mSDCTuKFqnFfN0XmA_LH0vI38I'

export const supabase = createClient(supabaseUrl, supabaseKey)
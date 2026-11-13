import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://dmudndgbijwjgbblnvdh.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_pIeeRtiBa3Zd_SmGGTblvg_9B_hwaGz";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

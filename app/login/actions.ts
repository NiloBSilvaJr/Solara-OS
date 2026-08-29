"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function entrar(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const email = String(formData.get("email") ?? "");
  const senha = String(formData.get("senha") ?? "");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    redirect("/login?erro=" + encodeURIComponent("E-mail ou senha invalidos."));
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function sair() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

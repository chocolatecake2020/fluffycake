import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);
const adminEmailWhitelist = (import.meta.env.VITE_ADMIN_EMAIL_WHITELIST || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const forcedAdminEmails = new Set([...adminEmailWhitelist, "ksdolphin@naver.com"]);

function isForcedAdminEmail(email) {
  return forcedAdminEmails.has((email || "").trim().toLowerCase());
}

async function getProfile(userId) {
  if (!hasSupabaseConfig || !supabase || !userId) return null;
  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data;
}

async function upsertProfileFromUser(user) {
  if (!hasSupabaseConfig || !supabase || !user?.id) return null;
  const metadata = user.user_metadata || {};
  const payload = {
    id: user.id,
    email: user.email || "",
    phone: metadata.phone || "",
    role: metadata.role || null,
    full_name: metadata.fullName || "",
    institution: metadata.institution || ""
  };
  const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "id" });
  if (error) return null;
  return getProfile(user.id);
}

async function ensureAdminProfile(user, existingProfile) {
  if (!hasSupabaseConfig || !supabase || !user?.id) return existingProfile;
  if (!isForcedAdminEmail(user.email)) return existingProfile;
  if (existingProfile?.role === "admin") return existingProfile;

  const payload = {
    id: user.id,
    role: "admin",
    email: user.email || "",
    phone: user.user_metadata?.phone || existingProfile?.phone || "",
    full_name: user.user_metadata?.fullName || existingProfile?.full_name || "",
    institution: user.user_metadata?.institution || existingProfile?.institution || ""
  };
  const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "id" });
  if (error) return { ...(existingProfile || {}), role: "admin" };
  const refreshed = await getProfile(user.id);
  return refreshed || { ...(existingProfile || {}), role: "admin" };
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;
    const loadingGuard = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        const nextSession = data.session ?? null;
        setSession(nextSession);
        if (nextSession?.user?.id) {
          let userProfile = await getProfile(data.session.user.id);
          if (!userProfile) userProfile = await upsertProfileFromUser(data.session.user);
          userProfile = await ensureAdminProfile(data.session.user, userProfile);
          if (mounted) setProfile(userProfile);
        } else {
          if (mounted) setProfile(null);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setProfile(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        setSession(nextSession ?? null);
        if (nextSession?.user?.id) {
          let userProfile = await getProfile(nextSession.user.id);
          if (!userProfile) userProfile = await upsertProfileFromUser(nextSession.user);
          userProfile = await ensureAdminProfile(nextSession.user, userProfile);
          setProfile(userProfile);
        } else {
          setProfile(null);
        }
      } catch (_error) {
        setSession(nextSession ?? null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingGuard);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      hasSupabaseConfig,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      async signIn(email, password) {
        if (!supabase) throw new Error("Supabase is not configured.");
        const normalizedEmail = (email || "").trim().toLowerCase();
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        return data;
      },
      async requestPasswordReset(email) {
        if (!supabase) throw new Error("Supabase is not configured.");
        const normalizedEmail = (email || "").trim().toLowerCase();
        if (!normalizedEmail) throw new Error("Email is required.");

        const redirectTo = `${window.location.origin}/login`;
        const firstTry = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
        if (!firstTry.error) return;

        // Fallback: if redirect URL is not allowed, retry without redirectTo
        // so Supabase can use project default site URL.
        const raw = (firstTry.error.message || "").toLowerCase();
        const isRedirectIssue = raw.includes("redirect") || raw.includes("not allowed");
        if (isRedirectIssue) {
          const secondTry = await supabase.auth.resetPasswordForEmail(normalizedEmail);
          if (!secondTry.error) return;
          throw secondTry.error;
        }
        throw firstTry.error;
      },
      async updatePassword(newPassword) {
        if (!supabase) throw new Error("Supabase is not configured.");
        const password = (newPassword || "").trim();
        if (!password) throw new Error("New password is required.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      async signUp({ email, password, phone = "", role = "clinic", fullName = "", institution = "" }) {
        if (!supabase) throw new Error("Supabase is not configured.");
        const normalizedEmail = (email || "").trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              phone,
              role,
              fullName,
              institution
            }
          }
        });
        if (error) throw error;
        if (data?.user?.id && data.session?.user) {
          await upsertProfileFromUser(data.session.user);
        }
        return data;
      },
      async signOut() {
        setSession(null);
        setProfile(null);
        if (!supabase) return;
        // Clear local browser session first so logout is reliable even with network hiccups.
        await supabase.auth.signOut({ scope: "local" });
        setSession(null);
        setProfile(null);
      },
      async selectRole(role) {
        if (!supabase || !session?.user?.id) return;
        const nextRole = isForcedAdminEmail(session.user.email) ? "admin" : role;
        const payload = {
          id: session.user.id,
          role: nextRole,
          email: session.user.email,
          phone: session.user.user_metadata?.phone || profile?.phone || "",
          full_name: session.user.user_metadata?.fullName || profile?.full_name || "",
          institution: session.user.user_metadata?.institution || profile?.institution || ""
        };
        const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "id" });
        if (error) throw error;
        const refreshed = await getProfile(session.user.id);
        setProfile(refreshed);
      }
    }),
    [loading, session, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { AuthProvider, useAuth };

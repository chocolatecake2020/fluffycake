import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getUserProfileById, updateMyUserProfile } from "../api/platformApi";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);
const ACTIVE_ACCOUNT_EMAIL_KEY = "vetbridge-active-account-email";
const adminEmailWhitelist = (import.meta.env.VITE_ADMIN_EMAIL_WHITELIST || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const forcedAdminEmails = new Set([...adminEmailWhitelist, "ksdolphin@naver.com"]);

function isForcedAdminEmail(email) {
  return forcedAdminEmails.has((email || "").trim().toLowerCase());
}

function readActiveAccountEmail() {
  try {
    return (window.localStorage.getItem(ACTIVE_ACCOUNT_EMAIL_KEY) || "").trim().toLowerCase();
  } catch (_error) {
    return "";
  }
}

function writeActiveAccountEmail(email) {
  try {
    const normalized = (email || "").trim().toLowerCase();
    if (!normalized) {
      window.localStorage.removeItem(ACTIVE_ACCOUNT_EMAIL_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_ACCOUNT_EMAIL_KEY, normalized);
  } catch (_error) {
    // Ignore storage failures in private/locked-down browser mode.
  }
}

async function getProfile(userId) {
  if (!hasSupabaseConfig || !supabase || !userId) return null;
  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data;
}

// Prefer the REST-based lookup so profile fetch never stalls on the supabase
// JS client's auth lock (most visible right after a PayPal redirect). Falls
// back to the JS client only if the REST path returns nothing.
async function getProfileFast(userId) {
  if (!userId) return null;
  try {
    const viaRest = await getUserProfileById(userId);
    if (viaRest) return viaRest;
  } catch (_restError) {
    // ignore and fall through to JS client
  }
  return getProfile(userId);
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
    institution: metadata.institution || "",
    paypal_email: metadata.paypalEmail || ""
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
    // Profile + admin reconciliation runs in the background so it never
    // blocks the initial render. Keeping the upsert/admin path here means
    // legacy accounts still get repaired on next session, just without
    // gating the page on those Supabase JS client calls.
    const reconcileProfile = async (sessionUser) => {
      if (!sessionUser?.id) return;
      try {
        let userProfile = await getProfileFast(sessionUser.id);
        if (mounted && userProfile) setProfile(userProfile);
        if (!userProfile) {
          userProfile = await upsertProfileFromUser(sessionUser);
          if (mounted && userProfile) setProfile(userProfile);
        }
        const adminAdjusted = await ensureAdminProfile(sessionUser, userProfile);
        if (mounted && adminAdjusted) setProfile(adminAdjusted);
      } catch (_error) {
        // Background reconciliation failures should never break the UI.
      }
    };

    // Hard guard: in case getSession itself stalls (rare, but observed
    // after PayPal redirects), make sure the loading screen does not
    // outlast 1.5s.
    const loadingGuard = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 1500);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        let nextSession = data.session ?? null;
        const expectedEmail = readActiveAccountEmail();
        const sessionEmail = (nextSession?.user?.email || "").trim().toLowerCase();
        if (nextSession?.user && expectedEmail && sessionEmail && sessionEmail !== expectedEmail) {
          // Mismatch between pinned and current account: clear local session
          // in the background; do not block the render on this either.
          supabase.auth.signOut({ scope: "local" }).catch(() => {});
          nextSession = null;
        }
        setSession(nextSession);
        if (nextSession?.user?.id) {
          if (!expectedEmail) writeActiveAccountEmail(nextSession.user.email);
          reconcileProfile(nextSession.user);
        } else {
          setProfile(null);
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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      try {
        const expectedEmail = readActiveAccountEmail();
        const sessionEmail = (nextSession?.user?.email || "").trim().toLowerCase();
        if (nextSession?.user && expectedEmail && sessionEmail && sessionEmail !== expectedEmail) {
          supabase.auth.signOut({ scope: "local" }).catch(() => {});
          setSession(null);
          setProfile(null);
          return;
        }
        setSession(nextSession ?? null);
        if (nextSession?.user?.id) {
          if (!expectedEmail) writeActiveAccountEmail(nextSession.user.email);
          reconcileProfile(nextSession.user);
        } else {
          setProfile(null);
        }
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
        // Pre-register the intended account so onAuthStateChange can accept this login.
        writeActiveAccountEmail(normalizedEmail);
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) {
          writeActiveAccountEmail("");
          throw error;
        }
        const signedEmail = (data?.user?.email || "").trim().toLowerCase();
        if (signedEmail && signedEmail !== normalizedEmail) {
          await supabase.auth.signOut({ scope: "local" });
          writeActiveAccountEmail("");
          throw new Error("Signed in to a different account. Please try again.");
        }
        writeActiveAccountEmail(normalizedEmail);
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
      async signUp({
        email,
        password,
        phone = "",
        role = "clinic",
        fullName = "",
        institution = "",
        paypalEmail = ""
      }) {
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
              institution,
              paypalEmail: (paypalEmail || "").trim().toLowerCase()
            }
          }
        });
        if (error) throw error;
        if (data?.user?.id && data.session?.user) {
          await upsertProfileFromUser(data.session.user);
        }
        return data;
      },
      async updatePayoutEmail(paypalEmail) {
        if (!session?.user?.id) {
          throw new Error("Sign in is required to update payout email.");
        }
        const userId = session.user.id;
        const normalized = (paypalEmail || "").trim().toLowerCase();
        // Use REST-based update to avoid Supabase JS auth-token storage lock contention,
        // which can intermittently block updates when switching reviewer accounts.
        let updated = null;
        try {
          updated = await updateMyUserProfile(userId, { paypal_email: normalized });
        } catch (restError) {
          if (!supabase) throw restError;
          const { error } = await supabase
            .from("user_profiles")
            .update({ paypal_email: normalized })
            .eq("id", userId);
          if (error) throw error;
        }
        let refreshed = updated;
        if (!refreshed) {
          refreshed = await getUserProfileById(userId).catch(() => null);
        }
        if (!refreshed && supabase) {
          refreshed = await getProfile(userId).catch(() => null);
        }
        if (refreshed) {
          setProfile(refreshed);
        } else {
          setProfile((prev) => (prev ? { ...prev, paypal_email: normalized } : prev));
        }
        return refreshed;
      },
      async updateDisplayName(displayName) {
        if (!session?.user?.id) {
          throw new Error("Sign in is required to update display name.");
        }
        const userId = session.user.id;
        const trimmed = (displayName || "").trim();
        // Mirror the payout email path: REST first, then JS client fallback.
        let updated = null;
        try {
          updated = await updateMyUserProfile(userId, { full_name: trimmed });
        } catch (restError) {
          if (!supabase) throw restError;
          const { error } = await supabase
            .from("user_profiles")
            .update({ full_name: trimmed })
            .eq("id", userId);
          if (error) throw error;
        }
        let refreshed = updated;
        if (!refreshed) {
          refreshed = await getUserProfileById(userId).catch(() => null);
        }
        if (!refreshed && supabase) {
          refreshed = await getProfile(userId).catch(() => null);
        }
        if (refreshed) {
          setProfile(refreshed);
        } else {
          setProfile((prev) => (prev ? { ...prev, full_name: trimmed } : prev));
        }
        return refreshed;
      },
      async signOut() {
        setSession(null);
        setProfile(null);
        writeActiveAccountEmail("");
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

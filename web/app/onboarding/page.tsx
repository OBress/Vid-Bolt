"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Cpu,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { completeOnboarding, checkUsernameUnique } from "./actions";



export default function OnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "valid" | "invalid" | "checking"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
  });

  // Debounced username validation
  useEffect(() => {
    if (!formData.username) {
      setUsernameStatus("idle");
      return;
    }

    if (formData.username.length < 3) {
      setUsernameStatus("invalid");
      return;
    }

    setValidating(true);
    setUsernameStatus("checking");

    const timer = setTimeout(async () => {
      try {
        const { unique, error: checkError } = await checkUsernameUnique(
          formData.username
        );
        if (checkError) throw new Error(checkError);
        setUsernameStatus(unique ? "valid" : "invalid");
      } catch (err: any) {
        console.error("Validation error:", err);
        setUsernameStatus("invalid");
      } finally {
        setValidating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.username]);



  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      await completeOnboarding(formData);
      // Redirection is handled in the action
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  const isNameValid = formData.name.trim().length >= 3;
  const isFormValid =
    isNameValid && usernameStatus === "valid" && !validating;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neutral-800 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-xl z-10">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 flex items-center justify-center rounded-lg shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              <Cpu className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tighter leading-none">
                VID-BOLT
              </h1>
              <p className="text-[8px] text-orange-500 font-mono tracking-widest uppercase">
                Initialization Phase
              </p>
            </div>
          </div>
        </div>

        <Card className="bg-neutral-900/80 border-neutral-800 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="h-1 bg-orange-500 w-full" />

          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-bold text-white tracking-wider uppercase">
              Identity Profile
            </CardTitle>
            <CardDescription className="text-neutral-400">
              Configure your operative credentials for the network.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                    Display Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    <Input
                      placeholder="Agent Name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className={`bg-black/50 border-neutral-800 pl-10 h-12 text-white placeholder:text-neutral-600 focus:border-orange-500 transition-colors ${
                        formData.name.length > 0 && formData.name.trim().length < 3
                          ? "border-red-500/50"
                          : formData.name.trim().length >= 3
                          ? "border-green-500/50"
                          : ""
                      }`}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-tight">
                    {formData.name.length > 0 && formData.name.trim().length < 3
                      ? "Display name must be at least 3 characters"
                      : "Your public display name across the network."}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                    Unique Alias (Username)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-mono">
                      @
                    </span>
                    <Input
                      placeholder="unique_id"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          username: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, ""),
                        })
                      }
                      className={`bg-black/50 border-neutral-800 pl-10 pr-10 h-12 text-white placeholder:text-neutral-600 focus:border-orange-500 transition-colors ${
                        usernameStatus === "invalid"
                          ? "border-red-500/50"
                          : usernameStatus === "valid"
                          ? "border-green-500/50"
                          : ""
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center h-full">
                      <AnimatePresence mode="wait">
                        {usernameStatus === "checking" && (
                          <motion.div
                            key="checking"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                          >
                            <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
                          </motion.div>
                        )}
                        {usernameStatus === "valid" && (
                          <motion.div
                            key="valid"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          </motion.div>
                        )}
                        {usernameStatus === "invalid" && (
                          <motion.div
                            key="invalid"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-tight">
                    {usernameStatus === "invalid" &&
                    formData.username.length > 0
                      ? formData.username.length < 3
                        ? "Alias must be at least 3 characters"
                        : "Alias already claimed or invalid"
                      : "This ID will be used to generate your secure 32-char hash ID."}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!isFormValid || loading}
                className={`w-full h-12 font-bold rounded-lg transition-all shadow-[0_4px_15px_rgba(249,115,22,0.3)] group ${
                  isFormValid
                    ? "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20"
                    : "bg-neutral-800 text-neutral-500 opacity-50 cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "INITIALIZE COMMAND CENTER"
                )}
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-neutral-800 text-center">
              <p className="text-[10px] text-neutral-600 font-mono tracking-widest uppercase">
                ENCRYPTION_ACTIVE // SYSTEM_INIT_V0.4
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

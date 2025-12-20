"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

const REASONS = [
  { id: "youtube", label: "YouTube Content" },
  { id: "advertising", label: "Advertising & Marketing" },
  { id: "tiktok", label: "Short-form (TikTok/Reels)" },
  { id: "personal", label: "Personal Projects" },
  { id: "education", label: "Educational Content" },
  { id: "other", label: "Other Business Use" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "valid" | "invalid" | "checking"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    reasons: [] as string[],
  });

  const router = useRouter();

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

  const handleNext = () => {
    if (step === 1) {
      if (formData.name && usernameStatus === "valid") {
        setStep(2);
      }
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => setStep(step - 1);

  const toggleReason = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      reasons: prev.reasons.includes(id)
        ? prev.reasons.filter((r) => r !== id)
        : [...prev.reasons, id],
    }));
  };

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

  const isStep1Valid =
    formData.name && usernameStatus === "valid" && !validating;

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
          <div className="h-1 bg-neutral-800 w-full overflow-hidden">
            <motion.div
              className="h-full bg-orange-500"
              initial={{ width: "0%" }}
              animate={{ width: `${(step / 2) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-bold text-white tracking-wider uppercase">
              {step === 1 ? "Identity Profile" : "Operational Objective"}
            </CardTitle>
            <CardDescription className="text-neutral-400">
              {step === 1
                ? "Configure your operative credentials for the network."
                : "Select the primary objectives for your command node."}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
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
                          className="bg-black/50 border-neutral-800 pl-10 h-12 text-white placeholder:text-neutral-600 focus:border-orange-500 transition-colors"
                        />
                      </div>
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
                    onClick={handleNext}
                    disabled={!isStep1Valid}
                    className={`w-full h-12 font-bold rounded-lg transition-all shadow-[0_4px_15px_rgba(249,115,22,0.3)] group ${
                      isStep1Valid
                        ? "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20"
                        : "bg-neutral-800 text-neutral-500 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    CONTINUE
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {REASONS.map((reason) => (
                      <button
                        key={reason.id}
                        onClick={() => toggleReason(reason.id)}
                        className={`p-4 rounded-xl border text-left transition-all duration-200 group relative ${
                          formData.reasons.includes(reason.id)
                            ? "bg-orange-500/10 border-orange-500"
                            : "bg-black/50 border-neutral-800 hover:border-neutral-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-medium ${
                              formData.reasons.includes(reason.id)
                                ? "text-orange-500"
                                : "text-neutral-400"
                            }`}
                          >
                            {reason.label}
                          </span>
                          {formData.reasons.includes(reason.id) && (
                            <CheckCircle2 className="w-4 h-4 text-orange-500" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      className="flex-1 h-12 border-neutral-800 bg-transparent text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    >
                      RETURN
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || formData.reasons.length === 0}
                      className="flex-[2] h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all shadow-[0_4px_15px_rgba(249,115,22,0.3)] group"
                    >
                      {loading ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        "INITIALIZE COMMAND CENTER"
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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

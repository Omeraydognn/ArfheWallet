/**
 * OnboardingTour.tsx — First-Time User Welcome Tour
 *
 * 4-step interactive onboarding:
 *  1. Welcome — what is ArfheWallet
 *  2. FHE Privacy — how Fully Homomorphic Encryption protects balances
 *  3. Security — seed phrase safety reminders
 *  4. Quick Start — feature overview (send, swap, shield, explore)
 *
 * Shown only once on first wallet creation.
 * State persisted via localStorage key `arfhe_onboarding_completed`.
 */

import React, { useState } from "react";
import {
  Dialog,
  Box,
  Typography,
  Button,
  IconButton,
  MobileStepper,
  Fade,
  Chip,
  useTheme,
} from "@mui/material";
import {
  Close,
  ArrowForward,
  ArrowBack,
  Shield,
  Lock,
  Visibility,
  SwapHoriz,
  Explore,
  Key,
  WarningAmber,
  CheckCircle,
  RocketLaunch,
} from "@mui/icons-material";

// ─── Step Data ──────────────────────────────────────────────────────

interface OnboardingStep {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  tips?: string[];
  badge?: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: "ArfheWallet'a Hoşgeldiniz",
    subtitle: "Gizliliğe öncelik veren Web3 cüzdanınız",
    description:
      "ArfheWallet, bakiyelerinizi tamamen gizli tutabilen ilk FHE (Fully Homomorphic Encryption) destekli tarayıcı cüzdanıdır. Ethereum, Arbitrum, Base ve özel ağları destekler.",
    icon: <RocketLaunch sx={{ fontSize: 32 }} />,
    gradient: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)",
    badge: "v1.0",
    tips: [
      "Multi-chain desteği: Ethereum, Arbitrum, Base",
      "DApp bağlantısı için WalletConnect desteği",
      "Spam token'ları otomatik tespit ve filtreleme",
    ],
  },
  {
    title: "FHE ile Gizli Bakiyeler",
    subtitle: "Fully Homomorphic Encryption nedir?",
    description:
      "FHE teknolojisi, token bakiyelerinizi blokzincir üzerinde şifreli tutmanızı sağlar. Kimse — madenciler, düğümler, hatta akıllı kontratlar bile — bakiyenizi göremez. Transfer ve işlemler şifreli halde gerçekleşir.",
    icon: <Shield sx={{ fontSize: 32 }} />,
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)",
    badge: "CoFHE",
    tips: [
      "\"Shield\" ile token'larınızı şifreleyin",
      "\"Unshield\" ile tekrar görünür yapın",
      "Şifreli transferler tam gizlilik sağlar",
    ],
  },
  {
    title: "Seed Phrase Güvenliği",
    subtitle: "12 kelimeniz = tüm varlıklarınız",
    description:
      "Seed phrase (kurtarma ifadesi) cüzdanınıza erişmenin TEK yoludur. Bunu kaybederseniz varlıklarınıza bir daha erişemezsiniz. ArfheWallet dahil hiç kimse onu kurtaramaz.",
    icon: <Key sx={{ fontSize: 32 }} />,
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)",
    badge: "Kritik",
    tips: [
      "Seed phrase'inizi ASLA dijital ortamda saklamayın",
      "Kağıda yazıp güvenli bir yerde saklayın",
      "Kimseyle paylaşmayın — ArfheWallet bunu asla istemez",
      "Ekran görüntüsü almayın, fotoğrafını çekmeyin",
    ],
  },
  {
    title: "Hazırsınız!",
    subtitle: "ArfheWallet'ın temel özellikleri",
    description:
      "Cüzdanınız kullanıma hazır. İşte hemen başlayabileceğiniz temel özellikler:",
    icon: <CheckCircle sx={{ fontSize: 32 }} />,
    gradient: "linear-gradient(135deg, #172554 0%, #1e40af 50%, #1e3a8a 100%)",
    tips: [
      "Token gönder/al — birden fazla ağda",
      "Swap — DEX üzerinden token takası",
      "Shield/Unshield — FHE ile gizli bakiyeler",
      "Revoke — token onaylarını kontrol et",
      "Settings → Security'den seed phrase'inizi yedekleyin",
    ],
  },
];

// ─── Storage Key ────────────────────────────────────────────────────

const ONBOARDING_KEY = "arfhe_onboarding_completed";
const BACKUP_REMINDER_KEY = "arfhe_backup_dismissed";

/** Check if onboarding has been completed */
export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}

/** Mark onboarding as completed */
export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "true");
  } catch {}
}

/** Check if backup reminder was dismissed */
export function isBackupReminderDismissed(): boolean {
  try {
    return localStorage.getItem(BACKUP_REMINDER_KEY) === "true";
  } catch {
    return false;
  }
}

/** Dismiss the backup reminder */
export function dismissBackupReminder(): void {
  try {
    localStorage.setItem(BACKUP_REMINDER_KEY, "true");
  } catch {}
}

// ─── Component ──────────────────────────────────────────────────────

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const maxSteps = STEPS.length;

  const handleNext = () => {
    if (activeStep === maxSteps - 1) {
      markOnboardingCompleted();
      onClose();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSkip = () => {
    markOnboardingCompleted();
    onClose();
  };

  const step = STEPS[activeStep];

  return (
    <Dialog
      open={open}
      onClose={handleSkip}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
          maxHeight: 560,
          m: 1,
        },
      }}
    >
      {/* Skip button */}
      <Box sx={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
        <IconButton
          onClick={handleSkip}
          size="small"
          aria-label="Skip onboarding tour"
          sx={{ color: "white", bgcolor: "rgba(0,0,0,0.2)", "&:hover": { bgcolor: "rgba(0,0,0,0.4)" } }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* Header with gradient + icon */}
      <Fade in key={`header-${activeStep}`} timeout={400}>
        <Box
          sx={{
            background: step.gradient,
            pt: 3,
            pb: 2.5,
            px: 2.5,
            textAlign: "center",
            position: "relative",
          }}
        >
          {/* Decorative circles */}
          <Box
            sx={{
              position: "absolute",
              top: -30,
              right: -30,
              width: 80,
              height: 80,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.08)",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: -20,
              left: -20,
              width: 60,
              height: 60,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.06)",
            }}
          />

          {/* Icon */}
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
              color: "white",
              backdropFilter: "blur(10px)",
            }}
          >
            {step.icon}
          </Box>

          {/* Badge */}
          {step.badge && (
            <Chip
              label={step.badge}
              size="small"
              sx={{
                mb: 1.5,
                height: 22,
                fontSize: "0.7rem",
                fontWeight: 700,
                bgcolor: "rgba(255,255,255,0.25)",
                color: "white",
                backdropFilter: "blur(10px)",
              }}
            />
          )}

          {/* Title */}
          <Typography variant="h5" fontWeight={800} sx={{ color: "white", mb: 0.5 }}>
            {step.title}
          </Typography>
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
            {step.subtitle}
          </Typography>
        </Box>
      </Fade>

      {/* Content */}
      <Fade in key={`content-${activeStep}`} timeout={400}>
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              lineHeight: 1.6,
              mb: 1.5,
              fontSize: "0.8rem",
            }}
          >
            {step.description}
          </Typography>

          {/* Tips */}
          {step.tips && step.tips.length > 0 && (
            <Box
              sx={{
                bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)",
                borderRadius: 3,
                p: 2,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              {step.tips.map((tip, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1,
                    mb: idx < step.tips!.length - 1 ? 1.2 : 0,
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      bgcolor: activeStep === 2 ? "warning.main" : "primary.main",
                      mt: 0.8,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.primary",
                      fontSize: "0.78rem",
                      lineHeight: 1.5,
                      fontWeight: activeStep === 2 ? 600 : 400,
                    }}
                  >
                    {tip}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Fade>

      {/* Footer: Stepper + Buttons */}
      <Box
        sx={{
          px: 2.5,
          pb: 2,
          pt: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          size="small"
          onClick={handleBack}
          disabled={activeStep === 0}
          startIcon={<ArrowBack />}
          sx={{
            fontWeight: 600,
            textTransform: "none",
            visibility: activeStep === 0 ? "hidden" : "visible",
          }}
        >
          Geri
        </Button>

        <MobileStepper
          variant="dots"
          steps={maxSteps}
          position="static"
          activeStep={activeStep}
          sx={{
            flexGrow: 0,
            bgcolor: "transparent",
            "& .MuiMobileStepper-dot": {
              width: 8,
              height: 8,
              mx: 0.5,
            },
            "& .MuiMobileStepper-dotActive": {
              bgcolor: "primary.main",
            },
          }}
          nextButton={<span />}
          backButton={<span />}
        />

        <Button
          size="small"
          variant="contained"
          onClick={handleNext}
          endIcon={activeStep === maxSteps - 1 ? <CheckCircle /> : <ArrowForward />}
          sx={{
            fontWeight: 700,
            textTransform: "none",
            borderRadius: 2,
            px: 2.5,
            bgcolor: activeStep === maxSteps - 1 ? "secondary.main" : "primary.main",
            "&:hover": {
              bgcolor: activeStep === maxSteps - 1 ? "secondary.dark" : "primary.dark",
            },
          }}
        >
          {activeStep === maxSteps - 1 ? "Başla" : "İleri"}
        </Button>
      </Box>
    </Dialog>
  );
}

// ─── Backup Reminder Banner ─────────────────────────────────────────

interface BackupReminderProps {
  onBackup: () => void;
  onDismiss: () => void;
}

export function BackupReminderBanner({ onBackup, onDismiss }: BackupReminderProps) {
  return (
    <Box
      sx={{
        mx: 2,
        mb: 2,
        p: 2,
        borderRadius: 3,
        background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
        border: "1px solid #f59e0b",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <WarningAmber sx={{ color: "#b45309", fontSize: 28, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: "#92400e", fontSize: "0.82rem", lineHeight: 1.3 }}
        >
          Seed Phrase'inizi Yedekleyin
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "#a16207", fontSize: "0.72rem", lineHeight: 1.3 }}
        >
          Cüzdanınızı kurtarmanın tek yolu. Henüz yedeklemediyseniz hemen yapın.
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flexShrink: 0 }}>
        <Button
          size="small"
          variant="contained"
          onClick={onBackup}
          sx={{
            bgcolor: "#b45309",
            color: "white",
            fontWeight: 700,
            fontSize: "0.68rem",
            textTransform: "none",
            borderRadius: 1.5,
            minWidth: 64,
            py: 0.3,
            "&:hover": { bgcolor: "#92400e" },
          }}
        >
          Yedekle
        </Button>
        <Button
          size="small"
          onClick={onDismiss}
          sx={{
            color: "#a16207",
            fontWeight: 600,
            fontSize: "0.62rem",
            textTransform: "none",
            minWidth: 64,
            py: 0,
          }}
        >
          Sonra
        </Button>
      </Box>
    </Box>
  );
}

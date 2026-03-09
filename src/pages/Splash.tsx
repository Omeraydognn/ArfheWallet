import { useNavigate } from "react-router";
import { Box, Typography, useTheme } from "@mui/material";
import { useEffect } from "react";
import { keyframes } from "@mui/system";

const float = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
`;

const shine = keyframes`
  to { background-position: 200% center; }
`;

function Splash() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("auth");
    }, 1800);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <Box sx={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: isDark
        ? 'linear-gradient(135deg, #0b1120 0%, #2563eb 100%)'
        : '#eff6ff',
      position: 'relative',
      overflow: 'hidden'
    }}>

      {/* Logo Image */}
      <Box
        component="img"
        src="Arfhe-logo.png"
        alt="Arfhe Wallet Logo"
        sx={{
          width: 120,
          height: 120,
          zIndex: 1,
          mb: 3,
          animation: `${float} 6s ease-in-out infinite`
        }}
      />

      <Typography variant="h4" fontWeight={800} sx={{
        zIndex: 1,
        letterSpacing: 4,
        background: isDark
          ? 'linear-gradient(90deg, #1e3a8a, #bfdbfe, #1e3a8a)'
          : 'linear-gradient(90deg, #dbeafe, #2563eb, #dbeafe)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: `${shine} 3s linear infinite`
      }}>
        ARFHE
      </Typography>
    </Box>
  );
}

export default Splash;
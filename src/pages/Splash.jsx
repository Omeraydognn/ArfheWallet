import { useNavigate } from "react-router";
import { Box, Typography } from "@mui/material";
import { useEffect } from "react";

function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("auth");
    }, 3500);
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
      background: '#ffffffff',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated Glow */}
      <Box sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 70%)',
        animation: 'pulse 3s infinite ease-in-out',
        zIndex: 0
      }} />

      {/* Logo Image */}
      <Box
        component="img"
        src="Arfhe-logo.png"
        alt="Logo"
        sx={{
          width: 120,
          height: 120,
          zIndex: 1,
          mb: 3,
          animation: 'float 6s ease-in-out infinite'
        }}
      />

      <Typography variant="h4" fontWeight={800} sx={{
        zIndex: 1,
        letterSpacing: 4,
        background: 'linear-gradient(90deg, #fff, #6366f1, #fff)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'shine 3s linear infinite'
      }}>
        ARFHE
      </Typography>

      <style>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.5; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.5; }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes shine {
          to { background-position: 200% center; }
        }
      `}</style>
    </Box>
  );
}

export default Splash;
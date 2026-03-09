import { Box, Typography, Button } from "@mui/material";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
        px: 4,
        py: 6,
      }}
    >
      <Typography variant="h1" sx={{ fontSize: 64, fontWeight: 800, mb: 1, opacity: 0.15 }}>
        404
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        {t("notFound.title", "Page Not Found")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 260 }}>
        {t("notFound.description", "The page you're looking for doesn't exist or has been moved.")}
      </Typography>
      <Button
        variant="contained"
        onClick={() => navigate("/home")}
        sx={{ borderRadius: 3, textTransform: "none", px: 4 }}
      >
        {t("notFound.goHome", "Go to Home")}
      </Button>
    </Box>
  );
}

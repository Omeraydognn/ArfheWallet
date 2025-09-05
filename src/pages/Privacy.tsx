import { Button, Stack, Typography } from "@mui/material";
import { useState } from "react";
import "./Privacy.css";

enum PrivacyLevel {
  NONE,
  PARTIAL,
  FULL,
}

export default function Privacy() {
  const [privacyLevel, setPrivacyLevel] = useState(PrivacyLevel.NONE);

  return (
    <>
      <div className="privacy">
        <div className="privacy-content">
          <Stack direction="column" alignItems="center">
            <Typography variant="h6" textAlign="center">
              Transactions Security Level
            </Typography>

            <Stack direction="row" spacing="1rem">
              <Button
                color="warning"
                variant={ privacyLevel == PrivacyLevel.FULL ? "contained" : "outlined" }
                onClick={(_e) => setPrivacyLevel(PrivacyLevel.FULL) }>
                FULL
              </Button>
              <Button 
              color= "success"
               variant={ privacyLevel == PrivacyLevel.PARTIAL ? "contained" : "outlined" }
               onClick={(_e) => setPrivacyLevel(PrivacyLevel.PARTIAL) }>
                PARTIAL
              </Button>
              <Button
                variant={ privacyLevel == PrivacyLevel.NONE ? "contained" : "outlined" }
                onClick={(_e) => setPrivacyLevel(PrivacyLevel.NONE) }>
                NONE
              </Button>
            </Stack>

            <Typography variant="body1" className="privacy-bottom-text">
              This will be the default security level for the later transactions.
            </Typography>
          </Stack>
        </div>
      </div>
    </>
  )
}
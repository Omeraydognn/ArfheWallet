import { Close, Lock, LockOpen } from "@mui/icons-material";
import { Avatar, Box, Card, Chip, Divider, Icon, Stack, Typography } from "@mui/material";
import "./History.css";

interface HistoryProps {
  activeNetwork: number,
}

function HistoryFilter() {
  return (
    <Stack direction="row" spacing=".5rem" marginY="1rem">
      <Chip variant="outlined" icon={<Close />} label=""/>
      <Chip variant="outlined" icon={<Lock />} label="Encrypted" />
      <Chip variant="outlined" icon={<LockOpen />} label="Not Encrypted" />
    </Stack>
  );
}

const TEST_PROPS = [
  { description: "Sent 5.0 USDT to 0x0000.0000", txId: "0x00000000000000000000000000000000", encrypted: false },
  { description: "Received 5.2 USDT from 0x1550.0000", txId: "0x00000000000000000000000000000000", encrypted: true },
  { description: "Sent 5.0 USDT to 0x0000.0000", txId: "0x00000000000000000000000000000000", encrypted: false },
  { description: "Received 5.2 USDT from 0x1550.0000", txId: "0x00000000000000000000000000000000", encrypted: true },
  { description: "Sent 5.0 USDT to 0x0000.0000", txId: "0x00000000000000000000000000000000", encrypted: false },
  { description: "Received 5.2 USDT from 0x1550.0000", txId: "0x00000000000000000000000000000000", encrypted: true },
  { description: "Sent 5.0 USDT to 0x0000.0000", txId: "0x00000000000000000000000000000000", encrypted: false },
  { description: "Received 5.2 USDT from 0x1550.0000", txId: "0x00000000000000000000000000000000", encrypted: true },
  { description: "Sent 5.0 USDT to 0x0000.0000", txId: "0x00000000000000000000000000000000", encrypted: false },
  { description: "Received 5.2 USDT from 0x1550.0000", txId: "0x00000000000000000000000000000000", encrypted: true },
]

export default function History({ activeNetwork }: HistoryProps) {
  return (
    <>
      <div className="history">
        <Typography variant="h6">
          History
        </Typography>


        <HistoryFilter />

        {
          TEST_PROPS.map(({description, txId, encrypted}, index) => {
            return (
              <Card key={index} className="history-card" variant="outlined">
                <Stack direction="row" alignItems="center">
                  <Avatar className="history-avatar"/>
                  
                  <Stack className="history-text">
                    <Typography fontSize={12} color="grey">
                      {txId}
                    </Typography>
                    <Typography fontSize={14}>
                      {description}
                    </Typography>
                  </Stack>

                  <Box className="history-icons">
                    {encrypted ? <Lock /> : <LockOpen />}
                  </Box>
                </Stack>
              </Card>
            );
          })
        }
      </div>
    </>
  );
}
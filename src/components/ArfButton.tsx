import { Button, ButtonProps, Stack } from '@mui/material';
import { ReactElement } from 'react';

interface ArfButtonProps extends ButtonProps {
  icon: ReactElement;
  label: string;
}

const ArfButton = ({ icon, label, ...props }: ArfButtonProps) => {
  return (
    <Button
      variant="outlined"
      aria-label={label.toLowerCase()}
      sx={{
        display: 'flex',
        flex: '1',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 1, // Adjust padding for better spacing
        textTransform: 'none', // Prevent uppercase text
      }}
      {...props}
    >
      <Stack
        direction="column"
        alignItems="center"
        spacing={0.5} // Space between icon and text
      >
        {icon}
        <span>{label}</span>
      </Stack>
    </Button>
  );
};

export default ArfButton;
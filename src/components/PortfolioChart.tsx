import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Button, useTheme, alpha } from '@mui/material';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    ReferenceArea
} from 'recharts';
import { useTranslation } from 'react-i18next';

interface PortfolioChartProps {
    currentBalanceUsd: number;
}

type Timeframe = '1D' | '1W' | '1M';

const generateMockHistory = (currentBalance: number, timeframe: Timeframe) => {
    const data = [];
    const now = new Date();

    let dataPoints = 24;
    let volatility = 0.02; // 2% daily volatility
    let stepMillis = 60 * 60 * 1000; // 1 hour

    if (timeframe === '1W') {
        dataPoints = 30; // ~4 points per day
        volatility = 0.05; // 5% weekly volatility
        stepMillis = 7 * 24 * 60 * 60 * 1000 / dataPoints;
    } else if (timeframe === '1M') {
        dataPoints = 30; // 1 point per day
        volatility = 0.12; // 12% monthly volatility
        stepMillis = 30 * 24 * 60 * 60 * 1000 / dataPoints;
    }

    // Work backwards from current balance
    let currentVal = currentBalance;

    // Seed random deterministically based on current balance so it doesn't jitter too wildly on re-renders,
    // but for a simple mock, Math.random is okay enough.

    const history = [];
    history.push({
        timestamp: now.getTime(),
        value: currentBalance,
        formattedTime: "Now"
    });

    for (let i = 1; i < dataPoints; i++) {
        // Random walk backwards
        const change = 1 + (Math.random() * volatility * 2 - volatility);
        currentVal = currentVal / change;

        const time = new Date(now.getTime() - i * stepMillis);

        let formattedTime = "";
        if (timeframe === '1D') {
            formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            formattedTime = time.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        history.push({
            timestamp: time.getTime(),
            value: Math.max(0, currentVal), // Ensure not negative
            formattedTime: formattedTime
        });
    }

    // Reverse to get chronological order
    return history.reverse();
};

function PortfolioChart({ currentBalanceUsd }: PortfolioChartProps) {
    const theme = useTheme();
    const { t } = useTranslation();
    const [timeframe, setTimeframe] = useState<Timeframe>('1W');

    // Regenerate data when timeframe or significant balance changes
    const chartData = useMemo(() => {
        return generateMockHistory(currentBalanceUsd, timeframe);
    }, [currentBalanceUsd, timeframe]);

    // Calculate percentage change
    const startValue = chartData.length > 0 ? chartData[0].value : currentBalanceUsd;
    const changeUsd = currentBalanceUsd - startValue;
    const changePct = startValue > 0 ? (changeUsd / startValue) * 100 : 0;
    const isPositive = changeUsd >= 0;

    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload?: { formattedTime?: string } }> }) => {
        if (active && payload && payload.length) {
            return (
                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        p: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                >
                    <Typography variant="body2" color="text.secondary" mb={0.5}>
                        {payload[0].payload?.formattedTime}
                    </Typography>
                    <Typography variant="subtitle2" fontWeight={700}>
                        ${payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                </Box>
            );
        }
        return null;
    };

    return (
        <Box sx={{ width: '100%' }}>
            {/* Header Info */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" mb={3}>
                <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                        {t("portfolio.balance")}
                    </Typography>
                    <Typography variant="h4" fontWeight="800" sx={{ letterSpacing: -1 }}>
                        ${currentBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>

                    <Stack direction="row" alignItems="center" spacing={1} mt={0.5}>
                        <Box
                            sx={{
                                px: 1,
                                py: 0.25,
                                borderRadius: 1.5,
                                bgcolor: isPositive ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.error.main, 0.1),
                                color: isPositive ? 'success.main' : 'error.main',
                                fontWeight: 700,
                                fontSize: '0.8rem'
                            }}
                        >
                            {isPositive ? '+' : ''}{changeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                        </Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={500}>
                            {timeframe === '1D' ? t("portfolio.today") : timeframe === '1W' ? t("portfolio.thisWeek") : t("portfolio.thisMonth")}
                        </Typography>
                    </Stack>
                </Box>

                {/* Timeframe Selectors */}
                <Stack direction="row" spacing={0.5} sx={{ bgcolor: 'action.hover', p: 0.5, borderRadius: 2 }}>
                    {(['1D', '1W', '1M'] as Timeframe[]).map((tf) => (
                        <Button
                            key={tf}
                            size="small"
                            onClick={() => setTimeframe(tf)}
                            sx={{
                                minWidth: 'auto',
                                px: 1.5,
                                py: 0.5,
                                fontSize: '0.75rem',
                                fontWeight: timeframe === tf ? 700 : 500,
                                color: timeframe === tf ? 'text.primary' : 'text.secondary',
                                bgcolor: timeframe === tf ? 'background.paper' : 'transparent',
                                borderRadius: 1.5,
                                boxShadow: timeframe === tf ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                '&:hover': {
                                    bgcolor: timeframe === tf ? 'background.paper' : 'action.selected',
                                }
                            }}
                        >
                            {tf}
                        </Button>
                    ))}
                </Stack>
            </Stack>

            {/* Interactive Chart */}
            <Box sx={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: theme.palette.divider, strokeWidth: 1, strokeDasharray: '4 4' }} />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={theme.palette.primary.main}
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6, fill: theme.palette.primary.main, stroke: theme.palette.background.paper, strokeWidth: 2 }}
                            animationDuration={1000}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </Box>
    );
}

export default React.memo(PortfolioChart);

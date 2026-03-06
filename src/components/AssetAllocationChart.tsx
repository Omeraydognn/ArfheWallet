import React from 'react';
import { Box, Typography } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface AssetAllocationProps {
    data: { name: string; value: number; color: string }[];
    isPrivacyMode: boolean;
}

export default function AssetAllocationChart({ data, isPrivacyMode }: AssetAllocationProps) {
    // If no data or all values are 0, show a placeholder
    const totalValue = data.reduce((acc, curr) => acc + curr.value, 0);
    const chartData = totalValue > 0 ? data : [{ name: 'No Assets', value: 1, color: '#334155' }];

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const isPlaceholder = payload[0].payload.name === 'No Assets';
            if (isPlaceholder) return null;

            const val = isPrivacyMode ? '***' : `$${payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            return (
                <Box sx={{
                    bgcolor: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                    p: 1.5,
                    borderRadius: 2,
                    color: 'white',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: payload[0].payload.color }}>
                        {payload[0].name}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {val}
                    </Typography>
                </Box>
            );
        }
        return null;
    };

    return (
        <Box sx={{ width: '100%', height: 300, position: 'relative' }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                </PieChart>
            </ResponsiveContainer>

            {/* Center Label */}
            <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
            }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Allocation
                </Typography>
            </Box>
        </Box>
    );
}

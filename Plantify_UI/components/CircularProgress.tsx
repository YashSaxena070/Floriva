import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface CircularProgressProps {
  size: number;
  strokeWidth: number;
  percentage: number;
  color: string;
  bgColor?: string;
  textColor?: string;
  showText?: boolean;
  textSize?: number;
}

export default function CircularProgress({
  size,
  strokeWidth,
  percentage,
  color,
  bgColor = '#E2EBE0',
  textColor,
  showText = true,
  textSize,
}: CircularProgressProps) {
  const clampPct = Math.min(100, Math.max(0, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampPct / 100) * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Foreground Active Progress Arc (Starts at 12 o'clock, fills clockwise) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="butt"
          fill="transparent"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {/* Percentage text in center */}
      {showText && (
        <View style={styles.textWrapper}>
          <Text
            style={[
              styles.percentText,
              {
                fontSize: textSize || (size > 100 ? 36 : 12),
                color: textColor || color,
              },
            ]}
          >
            {Math.round(clampPct)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  svg: {
    position: 'absolute',
  },
  textWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentText: {
    fontWeight: '800',
    textAlign: 'center',
  },
});

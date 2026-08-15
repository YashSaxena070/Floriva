import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, Rect, LinearGradient, Stop, Defs } from 'react-native-svg';
import { useUser } from './_layout';
import { analyzePlantHealth } from '@/services/plantHealthService';

const { width } = Dimensions.get('window');

interface HealthScanPoint {
  date: string;
  shortDate: string;
  score: number;
  status: 'Excellent' | 'Good' | 'Fair' | 'Needs Care';
  statusColor: string;
  badgeBg: string;
  timestamp: number;
}

const RANGE_OPTIONS = ['Last 1 Month', 'Last 3 Months', 'Last 6 Months', 'All Time'] as const;

function getStatusInfo(score: number) {
  if (score >= 90) return { status: 'Excellent' as const, statusColor: '#1E5322', badgeBg: '#1E5322' };
  if (score >= 80) return { status: 'Good' as const, statusColor: '#15803D', badgeBg: '#15803D' };
  if (score >= 70) return { status: 'Fair' as const, statusColor: '#D97706', badgeBg: '#D97706' };
  return { status: 'Needs Care' as const, statusColor: '#B91C1C', badgeBg: '#B91C1C' };
}

function getRangeDays(range: string): number | null {
  switch (range) {
    case 'Last 1 Month': return 30;
    case 'Last 3 Months': return 90;
    case 'Last 6 Months': return 180;
    case 'All Time': return null;
    default: return 30;
  }
}

export default function PlantHealthTimelineScreen() {
  const router = useRouter();
  const { plantName = 'Bedroom Snake Plant', currentScore: paramScore, scientificName = 'Dracaena trifasciata' } = useLocalSearchParams<{
    plantName?: string;
    currentScore?: string;
    scientificName?: string;
  }>();

  const { savedPlants } = useUser();
  const matchingPlant = savedPlants.find((p: any) => p.name === plantName);

  const [selectedRange, setSelectedRange] = useState('Last 1 Month');
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);

  // Compute dynamic health analysis for score consistency
  const healthAnalysis = useMemo(() => {
    return analyzePlantHealth({
      confidence: matchingPlant?.confidence,
      lastScannedDate: matchingPlant?.lastScannedDate,
      name: plantName,
      botanicalName: scientificName,
      watering: matchingPlant?.watering,
    });
  }, [matchingPlant, plantName, scientificName]);

  // Parse current score (minimum 65)
  const latestScore = paramScore ? parseInt(paramScore, 10) : (healthAnalysis.healthScore || matchingPlant?.confidence || 65);

  // Get real health history from the saved plant, ensuring raw stored confidence scores (e.g. 41%) are sanitized to healthScore (min 65%)
  const rawHistory: { date: number; score: number }[] = useMemo(() => {
    if (matchingPlant?.healthHistory && Array.isArray(matchingPlant.healthHistory)) {
      return matchingPlant.healthHistory
        .map((h: any) => ({
          date: h.date,
          score: Math.max(65, Math.min(99, Math.round(h.score < 65 ? healthAnalysis.healthScore : h.score))),
        }))
        .sort((a: any, b: any) => a.date - b.date);
    }
    return [];
  }, [matchingPlant?.healthHistory, healthAnalysis.healthScore]);

  // Filter by selected date range
  const filteredHistory = useMemo(() => {
    const rangeDays = getRangeDays(selectedRange);
    if (rangeDays === null) return rawHistory; // All Time
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return rawHistory.filter((h) => h.date >= cutoff);
  }, [rawHistory, selectedRange]);

  // Convert to display format
  const timelineData: HealthScanPoint[] = useMemo(() => {
    return filteredHistory.map((h) => {
      const pointDate = new Date(h.date);
      const shortDate = pointDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const fullDate = pointDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = pointDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const info = getStatusInfo(h.score);
      return {
        date: `${fullDate} • ${timeStr}`,
        shortDate,
        score: h.score,
        status: info.status,
        statusColor: info.statusColor,
        badgeBg: info.badgeBg,
        timestamp: h.date,
      };
    });
  }, [filteredHistory]);

  const hasData = timelineData.length > 0;

  const now = useMemo(() => Date.now(), []);

  const timeRange = useMemo(() => {
    const rangeDays = getRangeDays(selectedRange);
    let start = now - (rangeDays || 30) * 24 * 60 * 60 * 1000;
    let end = now;
    if (rangeDays === null) {
      const earliest = rawHistory.length > 0 ? rawHistory[0].date : now - 30 * 24 * 60 * 60 * 1000;
      start = earliest;
      if (end - start < 7 * 24 * 60 * 60 * 1000) {
        start = end - 30 * 24 * 60 * 60 * 1000;
      }
    }
    return { start, end };
  }, [selectedRange, rawHistory, now]);

  const axisLabels = useMemo(() => {
    const labels = [];
    const rangeDays = getRangeDays(selectedRange);
    const { start, end } = timeRange;

    if (rangeDays === 30) {
      for (let i = 4; i >= 0; i--) {
        const t = now - i * 7 * 24 * 60 * 60 * 1000;
        labels.push({
          timestamp: t,
          text: new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
      }
    } else if (rangeDays === 90) {
      for (let i = 3; i >= 0; i--) {
        const t = now - i * 30 * 24 * 60 * 60 * 1000;
        labels.push({
          timestamp: t,
          text: new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
      }
    } else if (rangeDays === 180) {
      for (let i = 3; i >= 0; i--) {
        const t = now - i * 60 * 24 * 60 * 60 * 1000;
        labels.push({
          timestamp: t,
          text: new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
      }
    } else {
      const diff = end - start;
      const segment = diff / 3;
      for (let i = 3; i >= 0; i--) {
        const t = end - i * segment;
        labels.push({
          timestamp: t,
          text: new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
      }
    }
    return labels;
  }, [selectedRange, timeRange, now]);

  // SVG Line Chart Dimensions
  const svgWidth = width - 48;
  const svgHeight = 230;
  const paddingLeft = 42;
  const paddingRight = 24;
  const paddingTop = 36;
  const paddingBottom = 34;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Build SVG Path string from real data using time scaling
  const points = useMemo(() => {
    if (!hasData) return [];

    const { start, end } = timeRange;
    const timeDiff = end - start || 1;

    return timelineData.map((pt) => {
      const t = Math.max(start, Math.min(end, pt.timestamp));
      const ratio = (t - start) / timeDiff;
      const x = paddingLeft + ratio * chartWidth;
      const y = paddingTop + (1 - pt.score / 100) * chartHeight;
      return { x, y, pt };
    });
  }, [timelineData, timeRange, chartWidth, chartHeight]);

  let linePath = '';
  let areaPath = '';

  if (points.length > 1) {
    linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
    }
    areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C3A27" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plant Health Timeline</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Plant Overview Card */}
        <View style={styles.plantSummaryCard}>
          <Image
            source={matchingPlant?.imageUri ? { uri: matchingPlant.imageUri } : require('@/assets/images/leaf.png')}
            style={styles.plantThumb}
            contentFit="cover"
          />
          <View style={styles.plantSummaryInfo}>
            <Text style={styles.plantSummaryName}>{plantName}</Text>
            <Text style={styles.plantSummaryBotanical}>{scientificName || matchingPlant?.botanicalName || 'Houseplant'}</Text>
          </View>
          <View style={[styles.scoreBadgeHeader, { backgroundColor: !hasData ? '#F3F4F6' : (latestScore < 80 ? '#FEE2E2' : '#EBF4EA') }]}>
            <Text style={[styles.scoreBadgeHeaderText, { color: !hasData ? '#9CA3AF' : (latestScore < 80 ? '#DC2626' : '#1E5322') }]}>
              {hasData ? `${latestScore}%` : '—'}
            </Text>
          </View>
        </View>

        {/* Dropdown Filter Bar */}
        <View style={styles.dropdownWrapper}>
          <TouchableOpacity
            style={styles.dropdownBtn}
            activeOpacity={0.85}
            onPress={() => setShowRangeDropdown(!showRangeDropdown)}
          >
            <Text style={styles.dropdownBtnText}>{selectedRange}</Text>
            <Ionicons name="chevron-down" size={16} color="#1C3A27" />
          </TouchableOpacity>

          {showRangeDropdown && (
            <View style={styles.dropdownMenu}>
              {RANGE_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setSelectedRange(item);
                    setShowRangeDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownMenuText, selectedRange === item && styles.dropdownMenuTextActive]}>
                    {item}
                  </Text>
                  {selectedRange === item && (
                    <Ionicons name="checkmark" size={14} color="#1E5322" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Section 1: Health Progress Line Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Health Progress</Text>

          <View style={styles.svgContainer}>
            <Svg width={svgWidth} height={svgHeight}>
              <Defs>
                <LinearGradient id="richGreenGradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#1E5322" stopOpacity="0.4" />
                  <Stop offset="45%" stopColor="#4E8C44" stopOpacity="0.2" />
                  <Stop offset="100%" stopColor="#EBF4EA" stopOpacity="0.05" />
                </LinearGradient>
              </Defs>

              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {[100, 75, 50, 25, 0].map((val) => {
                const yPos = paddingTop + (1 - val / 100) * chartHeight;
                return (
                  <React.Fragment key={val}>
                    <Line
                      x1={paddingLeft}
                      y1={yPos}
                      x2={svgWidth - paddingRight}
                      y2={yPos}
                      stroke="#E2EBE0"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <SvgText
                      x={paddingLeft - 8}
                      y={yPos + 4}
                      fill="#718E7B"
                      fontSize="10"
                      fontWeight="700"
                      textAnchor="end"
                    >
                      {val}%
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {hasData ? (
                <>
                  {/* Gradient Fill under the line (only for 2+ points) */}
                  {points.length > 1 && (
                    <Path d={areaPath} fill="url(#richGreenGradient)" />
                  )}

                  {/* Main Green Line Curve (only for 2+ points) */}
                  {points.length > 1 && (
                    <Path d={linePath} stroke="#1E5322" strokeWidth="3.5" fill="transparent" />
                  )}

                  {/* Node Dots on curve */}
                  {points.map((pt, idx) => (
                    <Circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r={idx === points.length - 1 ? "5.5" : "4"}
                      fill="#1E5322"
                      stroke="#FFFFFF"
                      strokeWidth="2.2"
                    />
                  ))}

                  {/* X-Axis Date Labels */}
                  {axisLabels.map((lbl, idx) => {
                    const ratio = (lbl.timestamp - timeRange.start) / (timeRange.end - timeRange.start || 1);
                    const x = paddingLeft + ratio * chartWidth;
                    return (
                      <SvgText
                        key={`axis-label-${idx}`}
                        x={x}
                        y={svgHeight - 8}
                        fill="#5F7265"
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {lbl.text}
                      </SvgText>
                    );
                  })}

                  {/* Tooltip Badge over Latest Point */}
                  {lastPoint && (
                    <>
                      <Rect
                        x={lastPoint.x - 22}
                        y={lastPoint.y - 32}
                        width="44"
                        height="22"
                        rx="6"
                        fill="#1E5322"
                      />
                      <SvgText
                        x={lastPoint.x}
                        y={lastPoint.y - 17}
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="800"
                        textAnchor="middle"
                      >
                        {lastPoint.pt.score}%
                      </SvgText>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Zero state: flat dashed line at 0% */}
                  <Line
                    x1={paddingLeft}
                    y1={paddingTop + chartHeight}
                    x2={svgWidth - paddingRight}
                    y2={paddingTop + chartHeight}
                    stroke="#D0E0CE"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                  <SvgText
                    x={svgWidth / 2}
                    y={paddingTop + chartHeight / 2}
                    fill="#8CA696"
                    fontSize="13"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    No scan data yet
                  </SvgText>
                </>
              )}
            </Svg>
          </View>
        </View>

        {/* Empty State Prompt */}
        {!hasData && (
          <View style={styles.emptyStateCard}>
            <Ionicons name="camera-outline" size={36} color="#8CA696" />
            <Text style={styles.emptyStateTitle}>No health scans recorded</Text>
            <Text style={styles.emptyStateDesc}>
              Scan your plant to start tracking its health over time. Each scan adds a data point to the graph.
            </Text>
            <TouchableOpacity
              style={styles.emptyStateScanBtn}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/upload-photo',
                params: { isRescan: 'true', targetPlantName: plantName },
              })}
            >
              <Ionicons name="camera" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.emptyStateScanBtnText}>Scan Plant Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Section 2: Health History List */}
        {hasData && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Health History</Text>

            <View style={styles.historyList}>
              {timelineData.slice().reverse().map((item, idx) => (
                <View key={idx} style={styles.historyRow}>
                  <View style={styles.historyLeft}>
                    <Image
                      source={matchingPlant?.imageUri ? { uri: matchingPlant.imageUri } : require('@/assets/images/leaf.png')}
                      style={styles.historyPlantThumb}
                      contentFit="cover"
                    />
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Ionicons name="checkmark-circle" size={14} color="#1E5322" style={{ marginRight: 4 }} />
                        <Text style={styles.historyDate}>{item.date}</Text>
                      </View>
                      <Text style={{ fontSize: 10, color: '#718E7B', fontWeight: '600' }}>Health Scan Record</Text>
                    </View>
                  </View>

                  <View style={styles.historyRight}>
                    <Text style={[styles.historyStatusText, { color: item.statusColor }]}>
                      {item.status}
                    </Text>
                    <View style={[styles.historyPill, { backgroundColor: item.badgeBg }]}>
                      <Text style={styles.historyPillText}>{item.score}%</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* No results for selected filter */}
        {rawHistory.length > 0 && !hasData && (
          <View style={styles.noFilterResultCard}>
            <Ionicons name="calendar-outline" size={28} color="#8CA696" />
            <Text style={styles.noFilterResultText}>
              No scans found in the selected time range. Try selecting a wider range.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FBF7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C3A27',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  plantSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    marginBottom: 16,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  plantThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    marginRight: 14,
    backgroundColor: '#EBF4EA',
  },
  plantSummaryInfo: {
    flex: 1,
  },
  plantSummaryName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
  },
  plantSummaryBotanical: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#718E7B',
    marginTop: 2,
  },
  scoreBadgeHeader: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  scoreBadgeHeaderText: {
    fontSize: 14,
    fontWeight: '800',
  },
  dropdownWrapper: {
    alignItems: 'flex-end',
    marginBottom: 16,
    zIndex: 100,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C3A27',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 42,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    paddingVertical: 6,
    width: 170,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownMenuText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5D50',
  },
  dropdownMenuTextActive: {
    fontWeight: '800',
    color: '#1E5322',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
    marginBottom: 14,
  },
  svgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySection: {
    marginBottom: 20,
  },
  historyList: {
    gap: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyPlantThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    backgroundColor: '#F8FBF7',
  },
  checkIconBg: {
    marginRight: 10,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyStatusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  historyPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 52,
    alignItems: 'center',
  },
  historyPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  // Empty state styles
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 28,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#1C3A27',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C3A27',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyStateDesc: {
    fontSize: 13,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  emptyStateScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E5322',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#1E5322',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateScanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  noFilterResultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#D0E0CE',
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  noFilterResultText: {
    fontSize: 13,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
  },
});

import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useUser } from '../_layout';

const FREQ_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  every_2_weeks: 'Every 2 weeks',
  monthly: 'Every month',
  every_2_months: 'Every 2 months',
};

const TIME_LABELS: Record<string, string> = {
  morning: 'Morning, 9:00 AM',
  noon: 'Afternoon, 12:00 PM',
  evening: 'Evening, 6:00 PM',
};

export default function CareScreen() {
  const { reminders } = useUser();
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  const toggleCompleted = (id: string) => {
    setCompletedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Care Schedule</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Section Header */}
        <View style={styles.todayHeader}>
          <Text style={styles.todayTitle}>All Reminders</Text>
          <Text style={styles.todayDate}>{reminders.length} plant{reminders.length !== 1 ? 's' : ''} scheduled</Text>
        </View>

        {/* Empty State */}
        {reminders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>No reminders yet</Text>
            <Text style={styles.emptyDescription}>
              Scan a plant, save it, and tap "Set Care Reminder" on the results page to add your first schedule.
            </Text>
          </View>
        ) : (
          reminders.map((rem, idx) => {
            const waterTaskId = `${rem.plantName}-water`;
            const fertTaskId = `${rem.plantName}-fert`;
            const waterDone = completedIds.includes(waterTaskId);
            const fertDone = completedIds.includes(fertTaskId);

            return (
              <View key={idx} style={styles.reminderGroup}>
                {/* Plant Name Badge */}
                <View style={styles.plantBadge}>
                  <Text style={{ fontSize: 18 }}>🌿</Text>
                  <Text style={styles.plantBadgeName}>{rem.plantName}</Text>
                  {rem.enableNotifications && (
                    <View style={styles.notiBadge}>
                      <Text style={{ fontSize: 10 }}>🔔</Text>
                      <Text style={styles.notiText}>Notifications on</Text>
                    </View>
                  )}
                </View>

                {/* Watering Task Card */}
                <View style={styles.taskCard}>
                  <TouchableOpacity
                    style={styles.checkButton}
                    onPress={() => toggleCompleted(waterTaskId)}
                  >
                    <View style={[styles.checkBox, waterDone && styles.checkedBox]}>
                      {waterDone && <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 'bold' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.taskInfo}>
                    <Text style={[styles.taskTitle, waterDone && styles.completedText]}>
                      Water {rem.plantName}
                    </Text>
                    <View style={styles.taskMeta}>
                      <Text style={{ fontSize: 11, marginRight: 2 }}>⏰</Text>
                      <Text style={styles.taskTime}>
                        {TIME_LABELS[rem.wateringTime] || 'Morning, 9:00 AM'} · {FREQ_LABELS[rem.wateringFreq] || 'Every 2 weeks'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.typeBadge, styles.waterBadge]}>
                    <Text style={{ fontSize: 16 }}>💧</Text>
                  </View>
                </View>

                {/* Fertilizer Task Card */}
                {rem.fertilizerFreq !== 'none' && (
                  <View style={styles.taskCard}>
                    <TouchableOpacity
                      style={styles.checkButton}
                      onPress={() => toggleCompleted(fertTaskId)}
                    >
                      <View style={[styles.checkBox, fertDone && styles.checkedBox]}>
                        {fertDone && <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 'bold' }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskTitle, fertDone && styles.completedText]}>
                        Fertilize {rem.plantName}
                      </Text>
                      <View style={styles.taskMeta}>
                        <Text style={{ fontSize: 11, marginRight: 2 }}>🌱</Text>
                        <Text style={styles.taskTime}>
                          {FREQ_LABELS[rem.fertilizerFreq] || 'Every 2 months'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.typeBadge, styles.fertilizerBadge]}>
                      <Text style={{ fontSize: 16 }}>🌱</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Streak Card — only if there are reminders */}
        {reminders.length > 0 && (
          <View style={styles.streakCard}>
            <Text style={{ fontSize: 26 }}>🔥</Text>
            <View style={styles.streakTextContainer}>
              <Text style={styles.streakTitle}>Keep it up!</Text>
              <Text style={styles.streakDescription}>
                You have {reminders.length} active care schedule{reminders.length !== 1 ? 's' : ''}. Check off tasks as you complete them!
              </Text>
            </View>
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5EF',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C3A27',
  },
  calendarToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBF4EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 110,
  },
  todayHeader: {
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C3A27',
  },
  todayDate: {
    fontSize: 13,
    color: '#718E7B',
    marginTop: 4,
  },
  reminderGroup: {
    marginBottom: 20,
  },
  plantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 10,
  },
  plantBadgeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C3A27',
    flex: 1,
  },
  notiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  notiText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4E8C44',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F0F5EF',
  },
  checkButton: {
    marginRight: 16,
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7DA676',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedBox: {
    backgroundColor: '#7DA676',
    borderColor: '#7DA676',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C3A27',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#8CA696',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  taskTime: {
    fontSize: 11,
    color: '#8CA696',
    fontWeight: '500',
  },
  typeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waterBadge: {
    backgroundColor: '#EEF6FC',
  },
  fertilizerBadge: {
    backgroundColor: '#FFF9EB',
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8F2',
    borderRadius: 18,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FFEFE0',
  },
  streakTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  streakTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D95C00',
    marginBottom: 4,
  },
  streakDescription: {
    fontSize: 12,
    color: '#7C481A',
    lineHeight: 16,
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0F5EF',
    marginTop: 20,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C3A27',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 12,
    color: '#718E7B',
    textAlign: 'center',
    lineHeight: 18,
  },
});

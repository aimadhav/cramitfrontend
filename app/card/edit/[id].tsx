import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Save, X, ArrowLeft } from 'lucide-react-native';

import colors from '@/constants/colors';
import { useFlashcardStore } from '@/store/flashcard-store';
import type { ContentType } from '@/types';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.gray[100],
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  contentTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contentTypeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  contentTypeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  contentTypeText: {
    fontSize: 14,
    color: colors.text,
  },
  contentTypeTextActive: {
    color: colors.background,
  },
  tagsInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: 44,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    backgroundColor: colors.gray[300],
  },
  saveButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notFoundText: {
    fontSize: 18,
    color: colors.textLight,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '500',
  },
});

const contentTypes: { value: ContentType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'latex', label: 'LaTeX' },
  { value: 'image', label: 'Image' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'audio', label: 'Audio' },
];

export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const flashcards = useFlashcardStore(state => state.flashcards);
  const updateFlashcard = useFlashcardStore(state => state.updateFlashcard);
  const pendingOperations = useFlashcardStore(state => state.pendingOperations);
  
  const card = flashcards.find(c => c.id === id);
  
  // Form state
  const [front, setFront] = useState(card?.front || '');
  const [back, setBack] = useState(card?.back || '');
  const [contentType, setContentType] = useState<ContentType>(card?.contentType || 'text');
  const [tagsText, setTagsText] = useState(card?.tags?.join(', ') || '');
  const [isSaving, setIsSaving] = useState(false);

  // Check if there are any pending operations for this card
  const isPending = Object.entries(pendingOperations).some(([key, op]) => {
    if (op.type === 'update' && key === id) return true;
    return false;
  });

  const hasChanges = () => {
    if (!card) return false;
    const tags = tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    return (
      front !== card.front ||
      back !== card.back ||
      contentType !== card.contentType ||
      JSON.stringify(tags) !== JSON.stringify(card.tags)
    );
  };

  const handleSave = async () => {
    if (!card) return;

    // Basic validation
    if (!front.trim() || !back.trim()) {
      Alert.alert(
        'Validation Error',
        'Both front and back content are required.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsSaving(true);
      const tags = tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      
      await updateFlashcard(id!, {
        front: front.trim(),
        back: back.trim(),
        contentType,
        tags,
      });

      Alert.alert(
        'Success',
        'Card updated successfully!',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to update card. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  };

  const headerRight = () => (
    <View style={styles.headerButtons}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => router.back()}
        disabled={isSaving || isPending}
      >
        <X size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  if (!card) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: "Card Not Found",
            headerShown: true,
            headerRight,
          }}
        />
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundText}>Card not found</Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: "Edit Card",
          headerShown: true,
          headerRight,
        }}
      />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Edit Flashcard</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Front (Question)</Text>
            <TextInput
              style={styles.textInput}
              value={front}
              onChangeText={setFront}
              placeholder="Enter the question or prompt..."
              multiline
              editable={!isSaving && !isPending}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Back (Answer)</Text>
            <TextInput
              style={styles.textInput}
              value={back}
              onChangeText={setBack}
              placeholder="Enter the answer or response..."
              multiline
              editable={!isSaving && !isPending}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Content Type</Text>
            <View style={styles.contentTypeContainer}>
              {contentTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.contentTypeButton,
                    contentType === type.value && styles.contentTypeButtonActive
                  ]}
                  onPress={() => setContentType(type.value)}
                  disabled={isSaving || isPending}
                >
                  <Text
                    style={[
                      styles.contentTypeText,
                      contentType === type.value && styles.contentTypeTextActive
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Tags (comma-separated)</Text>
            <TextInput
              style={styles.tagsInput}
              value={tagsText}
              onChangeText={setTagsText}
              placeholder="tag1, tag2, tag3..."
              editable={!isSaving && !isPending}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasChanges() || isSaving || isPending) && styles.saveButtonDisabled
            ]}
            onPress={handleSave}
            disabled={!hasChanges() || isSaving || isPending}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
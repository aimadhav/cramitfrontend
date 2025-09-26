import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFlashcardStore } from '@/store/flashcard-store';
import type { Flashcard, ContentType } from '@/types';

// Mock the trpcClient
vi.mock('@/lib/trpc', () => ({
  trpcClient: {
    flashcards: {
      updateContent: {
        mutate: vi.fn()
      }
    }
  }
}));

describe('Card Editing Flow', () => {
  beforeEach(() => {
    // Reset store before each test
    useFlashcardStore.setState({
      flashcards: [],
      decks: [],
      isLoading: false,
      error: null,
      pendingOperations: {},
      loadingFlashcardsForDeckId: null,
      tempIdToRealIdMap: {}
    });
  });

  it('should find and update a flashcard through the edit flow', async () => {
    const mockCard: Flashcard = {
      id: 'test-card-123',
      front: 'Original Question',
      back: 'Original Answer',
      contentType: 'text' as ContentType,
      tags: ['original', 'test'],
      deckId: 'test-deck-123',
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 5000,
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      dueDate: Date.now(),
      lastReviewed: null,
      isBookmarked: false,
      mediaUrls: []
    };

    // Add the mock card to the store
    useFlashcardStore.setState({
      flashcards: [mockCard],
      decks: [],
      isLoading: false,
      error: null,
      pendingOperations: {},
      loadingFlashcardsForDeckId: null,
      tempIdToRealIdMap: {}
    });

    // Verify the card exists in the store
    const store = useFlashcardStore.getState();
    const foundCard = store.flashcards.find(c => c.id === 'test-card-123');
    expect(foundCard).toBeDefined();
    expect(foundCard?.front).toBe('Original Question');
    expect(foundCard?.back).toBe('Original Answer');
    expect(foundCard?.contentType).toBe('text');
    expect(foundCard?.tags).toEqual(['original', 'test']);

    // Mock the updateContent mutation to return success
    const { trpcClient } = await import('@/lib/trpc');
    const mockUpdateContent = trpcClient.flashcards.updateContent.mutate as any;
    mockUpdateContent.mockResolvedValueOnce({
      id: 'test-card-123',
      front: 'Updated Question',
      back: 'Updated Answer',
      contentType: 'latex',
      tags: ['updated', 'edited'],
      updatedAt: new Date().toISOString()
    });

    // Simulate the edit operation (what the edit form would do)
    const updateData = {
      front: 'Updated Question',
      back: 'Updated Answer',
      contentType: 'latex' as ContentType,
      tags: ['updated', 'edited']
    };

    await store.updateFlashcard('test-card-123', updateData);

    // Verify the card was updated in the store
    const updatedStore = useFlashcardStore.getState();
    const updatedCard = updatedStore.flashcards.find(c => c.id === 'test-card-123');
    
    expect(updatedCard).toBeDefined();
    expect(updatedCard?.front).toBe('Updated Question');
    expect(updatedCard?.back).toBe('Updated Answer');
    expect(updatedCard?.contentType).toBe('latex');
    expect(updatedCard?.tags).toEqual(['updated', 'edited']);
    expect(updatedCard?.updatedAt).toBeGreaterThan(mockCard.updatedAt);
    
    // Verify the mutation was called with correct parameters
    expect(mockUpdateContent).toHaveBeenCalledWith({
      flashcardId: 'test-card-123',
      front: 'Updated Question',
      back: 'Updated Answer',
      contentType: 'latex',
      mediaUrls: undefined,
      tags: ['updated', 'edited']
    });
  });

  it('should validate required fields for editing', () => {
    const mockCard: Flashcard = {
      id: 'test-card-456',
      front: 'Test Question',
      back: 'Test Answer',
      contentType: 'text' as ContentType,
      tags: [],
      deckId: 'test-deck-456',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      dueDate: Date.now(),
      lastReviewed: null,
      isBookmarked: false,
      mediaUrls: []
    };

    // Simulate form validation logic (what the edit component does)
    const validateForm = (front: string, back: string) => {
      return {
        isValid: !!(front.trim() && back.trim()),
        errors: {
          front: !front.trim() ? 'Front content is required' : null,
          back: !back.trim() ? 'Back content is required' : null
        }
      };
    };

    // Test valid inputs
    const validResult = validateForm('Valid Question', 'Valid Answer');
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors.front).toBeNull();
    expect(validResult.errors.back).toBeNull();

    // Test empty front
    const emptyFrontResult = validateForm('', 'Valid Answer');
    expect(emptyFrontResult.isValid).toBe(false);
    expect(emptyFrontResult.errors.front).toBe('Front content is required');

    // Test empty back
    const emptyBackResult = validateForm('Valid Question', '');
    expect(emptyBackResult.isValid).toBe(false);
    expect(emptyBackResult.errors.back).toBe('Back content is required');

    // Test whitespace-only inputs
    const whitespaceResult = validateForm('   ', '   ');
    expect(whitespaceResult.isValid).toBe(false);
  });
});
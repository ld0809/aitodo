import type { Card, Todo } from '../types';

export function getTodosForCard(
  card: Card,
  todos: Todo[],
  remoteCardTodos: Record<string, Todo[]>,
) {
  if (card.pluginType === 'tapd' || card.cardType === 'shared') {
    return remoteCardTodos[card.id] || [];
  }

  const cardTagIds = new Set((Array.isArray(card.tags) ? card.tags : []).map((tag) => tag.id));
  const relatedByCard = (Array.isArray(todos) ? todos : []).filter((todo) => todo.cardId === card.id);
  const relatedByTags = cardTagIds.size === 0
    ? []
    : (Array.isArray(todos) ? todos : []).filter((todo) =>
        (Array.isArray(todo.tags) ? todo.tags : []).some((tag) => cardTagIds.has(tag.id)),
      );

  return Array.from(new Map([...relatedByCard, ...relatedByTags].map((todo) => [todo.id, todo])).values());
}

export function isCompletedTodo(todo: Todo) {
  return todo.status === 'done' || todo.status === 'completed';
}

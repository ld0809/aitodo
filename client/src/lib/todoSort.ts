import type { Todo } from '../types';

function toValidTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isCompletedTodo(todo: Todo): boolean {
  return todo.status === 'done' || todo.status === 'completed';
}

export function compareTodosForCardDisplay(left: Todo, right: Todo): number {
  const completedDiff = Number(isCompletedTodo(left)) - Number(isCompletedTodo(right));
  if (completedDiff !== 0) {
    return completedDiff;
  }

  const leftDueAt = toValidTimestamp(left.dueAt);
  const rightDueAt = toValidTimestamp(right.dueAt);
  const leftHasDueAt = leftDueAt !== null;
  const rightHasDueAt = rightDueAt !== null;

  if (leftHasDueAt !== rightHasDueAt) {
    return leftHasDueAt ? -1 : 1;
  }

  const leftCreatedAt = toValidTimestamp(left.createdAt) ?? 0;
  const rightCreatedAt = toValidTimestamp(right.createdAt) ?? 0;

  if (leftHasDueAt && rightHasDueAt) {
    if (leftDueAt !== rightDueAt) {
      return leftDueAt! - rightDueAt!;
    }

    if (leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt - leftCreatedAt;
    }
  } else if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return left.content.localeCompare(right.content, 'zh-CN');
}

export function sortTodosForCardDisplay(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodosForCardDisplay);
}

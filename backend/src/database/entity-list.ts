import { CardUserLayout } from './entities/card-user-layout.entity';
import { Card } from './entities/card.entity';
import { EmailCode } from './entities/email-code.entity';
import { MiniappBinding } from './entities/miniapp-binding.entity';
import { Tag } from './entities/tag.entity';
import { TapdConfig } from './entities/tapd-config.entity';
import { TodoCalendarSyncRecord } from './entities/todo-calendar-sync.entity';
import { TodoProgressEntry } from './entities/todo-progress.entity';
import { Todo } from './entities/todo.entity';
import { User } from './entities/user.entity';

export const APP_ENTITIES = [
  User,
  EmailCode,
  Tag,
  Todo,
  TodoProgressEntry,
  Card,
  TapdConfig,
  CardUserLayout,
  MiniappBinding,
  TodoCalendarSyncRecord,
];

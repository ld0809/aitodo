import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { GenerateAiReportDto } from './dto/generate-ai-report.dto';

type AiReportProvider = 'iflow' | 'openai';
type OpenAiApiMode = 'responses' | 'chat_completions';

interface ReportRange {
  startAt: Date;
  endAt: Date;
  defaultedToLastWeek: boolean;
}

interface ReportTodoProgressItem {
  todoId: string;
  todoContent: string;
  todoStatus: Todo['status'];
  updates: Array<{
    content: string;
    createdAt: Date;
  }>;
}

interface IFlowStreamMessage {
  type?: string;
  chunk?: {
    text?: string;
  };
  error?: string;
}

interface IFlowClient {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (message: string, files?: string[]) => Promise<void>;
  receiveMessages: () => AsyncIterable<IFlowStreamMessage>;
}

interface IFlowClientConstructor {
  new (options: Record<string, unknown>): IFlowClient;
}

interface IFlowSdk {
  IFlowClient: IFlowClientConstructor;
  MessageType: Record<string, string>;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(TodoProgressEntry)
    private readonly todoProgressRepository: Repository<TodoProgressEntry>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async generateAiReport(userId: string, dto: GenerateAiReportDto) {
    const range = this.resolveRange(dto);
    const provider = this.resolveAiReportProvider();
    const allProgressEntries = await this.todoProgressRepository.find({
      where: {
        userId,
      },
      relations: {
        todo: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
    const progressEntries = allProgressEntries.filter((entry) => {
      const createdAt = new Date(entry.createdAt);
      const timestamp = createdAt.getTime();
      if (Number.isNaN(timestamp)) {
        return false;
      }
      return timestamp >= range.startAt.getTime() && timestamp <= range.endAt.getTime();
    });

    const todoProgressItems = this.groupTodoProgress(progressEntries);
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (todoProgressItems.length === 0) {
      return {
        provider,
        period: {
          startAt: range.startAt.toISOString(),
          endAt: range.endAt.toISOString(),
          defaultedToLastWeek: range.defaultedToLastWeek,
        },
        todoCount: 0,
        progressCount: 0,
        report: '该时间段内没有进度更新，暂无可总结内容。',
      };
    }

    try {
      const prompt = this.buildPrompt(range, todoProgressItems, user?.target ?? null);
      const report =
        provider === 'openai'
          ? await this.generateByOpenAi(prompt)
          : await this.generateByIFlow(prompt);
      if (!report.trim()) {
        throw new InternalServerErrorException(`${provider} returned empty report`);
      }

      return {
        provider,
        period: {
          startAt: range.startAt.toISOString(),
          endAt: range.endAt.toISOString(),
          defaultedToLastWeek: range.defaultedToLastWeek,
        },
        todoCount: todoProgressItems.length,
        progressCount: progressEntries.length,
        report,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `unknown ${provider} error`;
      this.logger.error(`AI report generation failed by ${provider}: ${message}`);
      throw new InternalServerErrorException(`${provider} report generation failed: ${message}`);
    }
  }

  private resolveAiReportProvider(): AiReportProvider {
    const rawProvider = process.env.AI_REPORT_PROVIDER?.trim().toLowerCase();
    if (!rawProvider || rawProvider === 'iflow') {
      return 'iflow';
    }
    if (rawProvider === 'openai') {
      return 'openai';
    }
    throw new InternalServerErrorException(`unsupported AI report provider: ${rawProvider}`);
  }

  private resolveRange(dto: GenerateAiReportDto): ReportRange {
    if (dto.startAt || dto.endAt) {
      if (!dto.startAt || !dto.endAt) {
        throw new BadRequestException('startAt and endAt must be provided together');
      }

      const startAt = new Date(dto.startAt);
      const endAt = new Date(dto.endAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        throw new BadRequestException('invalid report time range');
      }
      if (startAt > endAt) {
        throw new BadRequestException('startAt must be earlier than endAt');
      }

      return {
        startAt,
        endAt,
        defaultedToLastWeek: false,
      };
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;

    const currentWeekMonday = new Date(today);
    currentWeekMonday.setDate(currentWeekMonday.getDate() - daysSinceMonday);

    const lastWeekMonday = new Date(currentWeekMonday);
    lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

    const lastWeekSunday = new Date(currentWeekMonday.getTime() - 1);

    return {
      startAt: lastWeekMonday,
      endAt: lastWeekSunday,
      defaultedToLastWeek: true,
    };
  }

  private groupTodoProgress(entries: TodoProgressEntry[]): ReportTodoProgressItem[] {
    const todoMap = new Map<string, ReportTodoProgressItem>();

    for (const entry of entries) {
      if (!entry.todo) {
        continue;
      }

      const exists = todoMap.get(entry.todoId);
      if (exists) {
        exists.updates.push({
          content: entry.content,
          createdAt: entry.createdAt,
        });
        continue;
      }

      todoMap.set(entry.todoId, {
        todoId: entry.todoId,
        todoContent: entry.todo.content,
        todoStatus: entry.todo.status,
        updates: [
          {
            content: entry.content,
            createdAt: entry.createdAt,
          },
        ],
      });
    }

    return Array.from(todoMap.values()).sort((left, right) => {
      const leftTime = left.updates[left.updates.length - 1]?.createdAt.getTime() ?? 0;
      const rightTime = right.updates[right.updates.length - 1]?.createdAt.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }

  private buildPrompt(range: ReportRange, todoItems: ReportTodoProgressItem[], target: string | null): string {
    const taskLines = todoItems.map((todo, index) => {
      const updates = todo.updates
        .map((update, updateIndex) => {
          return `    ${updateIndex + 1}. [${this.formatDateTime(update.createdAt)}] ${update.content}`;
        })
        .join('\n');

      return `${index + 1}. 待办：${todo.todoContent}\n   当前状态：${todo.todoStatus}\n   进度更新：\n${updates}`;
    });

    const targetBlock = target?.trim() ? `用户当前目标：${target.trim()}\n` : '';

    return [
      '你是一个项目复盘助理，请基于给定待办进度生成中文工作报告。',
      '输出要求：',
      '1. 生成「总结概览」「重点进展」「风险/阻塞」「下周期建议」四个小节。',
      '2. 不要虚构事实，只能基于输入数据归纳。',
      '3. 语言简洁，便于直接复制到周报/月报。',
      '',
      `统计时间段：${this.formatDateTime(range.startAt)} ~ ${this.formatDateTime(range.endAt)}`,
      targetBlock,
      '待办进展数据：',
      taskLines.join('\n'),
    ].join('\n');
  }

  private async generateByIFlow(prompt: string): Promise<string> {
    let sdk: IFlowSdk;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sdk = require('@iflow-ai/iflow-cli-sdk') as IFlowSdk;
    } catch {
      throw new Error('Cannot load @iflow-ai/iflow-cli-sdk, please install it in backend dependencies.');
    }
    const client = new sdk.IFlowClient({
      logLevel: process.env.AI_REPORT_IFLOW_LOG_LEVEL ?? 'ERROR',
      autoStartProcess: process.env.AI_REPORT_IFLOW_AUTOSTART !== 'false',
      timeout: Number(process.env.AI_REPORT_IFLOW_TIMEOUT_MS ?? 300000),
    });

    const assistantType = sdk.MessageType.ASSISTANT;
    const finishType = sdk.MessageType.TASK_FINISH;
    const errorType = sdk.MessageType.ERROR;
    let fullResponse = '';

    await client.connect();
    try {
      await client.sendMessage(prompt);
      for await (const message of client.receiveMessages()) {
        if (message.type === assistantType && message.chunk?.text) {
          fullResponse += message.chunk.text;
          continue;
        }
        if (message.type === finishType) {
          break;
        }
        if (message.type === errorType) {
          throw new Error(message.error || 'unknown iFlow error');
        }
      }
    } finally {
      await client.disconnect().catch(() => undefined);
    }

    return fullResponse.trim();
  }

  private async generateByOpenAi(prompt: string): Promise<string> {
    const apiKey = process.env.AI_REPORT_OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('AI_REPORT_OPENAI_API_KEY is required when AI_REPORT_PROVIDER=openai.');
    }

    const model = process.env.AI_REPORT_OPENAI_MODEL?.trim() || 'gpt-5-mini';
    const apiMode = this.resolveOpenAiApiMode();
    const baseUrl = (process.env.AI_REPORT_OPENAI_BASE_URL || 'https://api.openai.com/v1')
      .trim()
      .replace(/\/+$/, '');
    const timeout = Number(process.env.AI_REPORT_OPENAI_TIMEOUT_MS ?? 300000);

    if (apiMode === 'chat_completions') {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout,
        },
      );

      return this.extractOpenAiChatCompletionsText(response.data);
    }

    const response = await axios.post(
      `${baseUrl}/responses`,
      {
        model,
        input: prompt,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout,
      },
    );

    return this.extractOpenAiReportText(response.data);
  }

  private extractOpenAiReportText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return '';
    }

    const typedPayload = payload as {
      output_text?: unknown;
      output?: Array<{
        content?: Array<{
          text?: string | { value?: string };
        }>;
      }>;
    };

    if (typeof typedPayload.output_text === 'string' && typedPayload.output_text.trim()) {
      return typedPayload.output_text.trim();
    }

    const textParts = (typedPayload.output ?? []).flatMap((item) =>
      (item.content ?? []).flatMap((contentItem) => {
        if (typeof contentItem.text === 'string') {
          return [contentItem.text];
        }
        if (
          contentItem.text &&
          typeof contentItem.text === 'object' &&
          typeof contentItem.text.value === 'string'
        ) {
          return [contentItem.text.value];
        }
        return [];
      }),
    );

    return textParts.join('\n').trim();
  }

  private resolveOpenAiApiMode(): OpenAiApiMode {
    const rawMode = process.env.AI_REPORT_OPENAI_API_MODE?.trim().toLowerCase();
    if (!rawMode || rawMode === 'responses') {
      return 'responses';
    }
    if (rawMode === 'chat_completions' || rawMode === 'chat-completions') {
      return 'chat_completions';
    }
    throw new Error(`unsupported AI_REPORT_OPENAI_API_MODE: ${rawMode}`);
  }

  private extractOpenAiChatCompletionsText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return '';
    }

    const typedPayload = payload as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };

    const firstContent = typedPayload.choices?.[0]?.message?.content;
    if (typeof firstContent === 'string') {
      return firstContent.trim();
    }

    if (Array.isArray(firstContent)) {
      return firstContent
        .map((item) => (item?.type === 'text' || item?.text ? item?.text || '' : ''))
        .join('\n')
        .trim();
    }

    return '';
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

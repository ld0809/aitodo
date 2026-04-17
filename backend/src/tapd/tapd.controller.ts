import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TapdConfigService, CreateTapdConfigDto, UpdateTapdConfigDto } from './tapd-config.service';
import { TapdDetailPayload, TapdService } from '../plugins/adapters/tapd.service';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value: string): string {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'');
}

function sanitizeUrl(value: string): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  if (/^(https?:|mailto:)/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function renderInlineMarkdown(value: string): string {
  let html = escapeHtml(value);

  html = html.replace(/`([^`]+)`/g, (_match, code) => `<code>${escapeHtml(code)}</code>`);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text, href) => {
    const safeHref = sanitizeUrl(href);
    if (!safeHref) {
      return escapeHtml(text);
    }
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${text}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');

  return html;
}

function renderMarkdown(value: string): string {
  const source = decodeHtmlEntities(String(value || ''))
    .replace(/\r\n/g, '\n')
    .trim();

  if (!source) {
    return '<p>暂无描述</p>';
  }

  const lines = source.split('\n');
  const htmlBlocks: string[] = [];
  let paragraphLines: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let codeFenceLines: string[] = [];
  let inCodeFence = false;
  let blockquoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    htmlBlocks.push(`<p>${renderInlineMarkdown(paragraphLines.join('<br />'))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    htmlBlocks.push(`<${listType}>${listItems.join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length === 0) {
      return;
    }
    htmlBlocks.push(`<blockquote><p>${renderInlineMarkdown(blockquoteLines.join('<br />'))}</p></blockquote>`);
    blockquoteLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      flushBlockquote();
      if (inCodeFence) {
        htmlBlocks.push(`<pre><code>${escapeHtml(codeFenceLines.join('\n'))}</code></pre>`);
        codeFenceLines = [];
      }
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      codeFenceLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      const level = headingMatch[1].length;
      htmlBlocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    }
    flushBlockquote();

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') {
        flushList();
      }
      listType = 'ul';
      listItems.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') {
        flushList();
      }
      listType = 'ol';
      listItems.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }
    flushList();

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushBlockquote();

  if (inCodeFence && codeFenceLines.length > 0) {
    htmlBlocks.push(`<pre><code>${escapeHtml(codeFenceLines.join('\n'))}</code></pre>`);
  }

  return htmlBlocks.join('') || '<p>暂无描述</p>';
}

function sanitizeTapdHtml(value: string): string {
  const source = decodeHtmlEntities(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim();

  if (!source) {
    return '<p>暂无描述</p>';
  }

  const allowedTags = new Set([
    'a', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
  ]);

  return source.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (match, tagName, attrs) => {
    const tag = String(tagName || '').toLowerCase();
    if (!allowedTags.has(tag)) {
      return '';
    }

    const isClosing = match.startsWith('</');
    if (isClosing) {
      return `</${tag}>`;
    }

    if (tag === 'br' || tag === 'hr') {
      return `<${tag}>`;
    }

    if (tag === 'a') {
      const hrefMatch = String(attrs || '').match(/\bhref\s*=\s*(['"])(.*?)\1/i);
      const safeHref = sanitizeUrl(hrefMatch?.[2] || '');
      if (!safeHref) {
        return '<a>';
      }
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">`;
    }

    return `<${tag}>`;
  });
}

function formatTapdDescription(value: string): string {
  const normalized = decodeHtmlEntities(String(value || '')).trim();
  if (!normalized) {
    return '<p>暂无描述</p>';
  }

  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(normalized);
  return hasHtmlTags ? sanitizeTapdHtml(normalized) : renderMarkdown(normalized);
}

function buildTapdStatusOptions(statusMap: Record<string, string>) {
  const uniqueOptions = new Map<string, { value: string; label: string }>();

  Object.entries(statusMap).forEach(([rawValue, rawLabel]) => {
    const value = String(rawValue || '').trim();
    const label = String(rawLabel || rawValue || '').trim();
    if (!value || !label) {
      return;
    }

    const dedupeKey = value.toLowerCase();
    if (!uniqueOptions.has(dedupeKey)) {
      uniqueOptions.set(dedupeKey, { value, label });
    }
  });

  return Array.from(uniqueOptions.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

function renderTapdDetailHtml(detail: TapdDetailPayload): string {
  const metaPairs = [
    ['类型', detail.kind === 'bug' ? '缺陷' : '需求'],
    ['状态', detail.status || '未知'],
    ['负责人', detail.owner || '未设置'],
    ['迭代', detail.iterationName || '未设置'],
    ['版本', detail.version || '未设置'],
    ['优先级', detail.priority || '未设置'],
    ['严重程度', detail.severity || '未设置'],
    ['创建时间', detail.created || '未知'],
    ['更新时间', detail.modified || '未知'],
  ];

  const metaHtml = metaPairs
    .map(([label, value]) => `
      <div class="meta-row">
        <dt class="meta-label">${escapeHtml(label)}</dt>
        <dd class="meta-value">${escapeHtml(value)}</dd>
      </div>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(detail.title || `TAPD ${detail.kind}`)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --panel: #ffffff;
        --line: #dbe5f1;
        --text: #0f172a;
        --muted: #475569;
        --accent-bg: #eff6ff;
        --accent-line: rgba(59, 130, 246, 0.22);
        --accent-text: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%);
        color: var(--text);
      }
      .shell {
        max-width: 1040px;
        margin: 0 auto;
        display: grid;
        gap: 16px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
      }
      .hero {
        padding: 22px 24px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid var(--accent-line);
        background: var(--accent-bg);
        color: var(--accent-text);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      h1 {
        margin: 14px 0 10px;
        font-size: 22px;
        line-height: 1.45;
      }
      .sub {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.7;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 18px;
        padding: 20px 24px 24px;
      }
      .meta-row {
        display: grid;
        grid-template-columns: 84px minmax(0, 1fr);
        column-gap: 12px;
        align-items: start;
        padding: 2px 0;
      }
      .meta-label {
        color: #64748b;
        font-size: 13px;
        font-weight: 600;
        margin: 0;
      }
      .meta-value {
        color: var(--text);
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
        margin: 0;
      }
      @media (max-width: 720px) {
        .meta {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .content {
        padding: 22px 24px 26px;
      }
      .content h2 {
        margin: 0 0 12px;
        font-size: 16px;
      }
      .content-body {
        color: var(--text);
        font-size: 14px;
        line-height: 1.8;
        word-break: break-word;
      }
      .content-body > :first-child {
        margin-top: 0;
      }
      .content-body > :last-child {
        margin-bottom: 0;
      }
      .content-body p,
      .content-body ul,
      .content-body ol,
      .content-body blockquote,
      .content-body pre,
      .content-body table {
        margin: 0 0 14px;
      }
      .content-body ul,
      .content-body ol {
        padding-left: 22px;
      }
      .content-body li + li {
        margin-top: 6px;
      }
      .content-body a {
        color: #2563eb;
        text-decoration: none;
      }
      .content-body a:hover {
        text-decoration: underline;
      }
      .content-body code {
        padding: 2px 6px;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.06);
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
      }
      .content-body pre {
        overflow-x: auto;
        padding: 14px 16px;
        border-radius: 14px;
        background: #0f172a;
        color: #e2e8f0;
      }
      .content-body pre code {
        padding: 0;
        background: transparent;
        color: inherit;
      }
      .content-body blockquote {
        padding: 12px 16px;
        border-left: 4px solid rgba(59, 130, 246, 0.28);
        border-radius: 0 12px 12px 0;
        background: rgba(239, 246, 255, 0.72);
        color: #334155;
      }
      .content-body h1,
      .content-body h2,
      .content-body h3,
      .content-body h4,
      .content-body h5,
      .content-body h6 {
        margin: 18px 0 10px;
        line-height: 1.4;
      }
      .content-body table {
        width: 100%;
        border-collapse: collapse;
      }
      .content-body th,
      .content-body td {
        padding: 10px 12px;
        border: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }
      .content-body th {
        background: #f8fafc;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="panel hero">
        <span class="badge">TAPD ${escapeHtml(detail.kind === 'bug' ? '缺陷' : '需求')}</span>
        <h1>${escapeHtml(detail.title || `#${detail.id}`)}</h1>
        <div class="sub">#${escapeHtml(detail.id)} · Workspace ${escapeHtml(detail.workspaceId)}</div>
      </section>
      <section class="panel">
        <dl class="meta">${metaHtml}</dl>
      </section>
      <section class="panel content">
        <h2>描述</h2>
        <div class="content-body">${formatTapdDescription(detail.description)}</div>
      </section>
    </div>
  </body>
</html>`;
}

function renderTapdDetailErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TAPD 详情加载失败</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8fafc;
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        max-width: 480px;
        padding: 24px 28px;
        border: 1px solid #dbe5f1;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 18px;
      }
      p {
        margin: 0;
        color: #475569;
        line-height: 1.7;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <section class="panel">
      <h1>TAPD 详情加载失败</h1>
      <p>${escapeHtml(message)}</p>
    </section>
  </body>
</html>`;
}

@Controller('api')
export class TapdController {
  constructor(
    private readonly tapdConfigService: TapdConfigService,
    private readonly tapdService: TapdService,
  ) {}

  // Configuration endpoints
  @Post('tapd/configs')
  async createConfig(@Body() dto: CreateTapdConfigDto) {
    return this.tapdConfigService.create(dto);
  }

  @Get('tapd/configs')
  async findAllConfigs() {
    return this.tapdConfigService.findAll();
  }

  @Get('tapd/configs/:id')
  async findConfig(@Param('id') id: string) {
    return this.tapdConfigService.findOne(id);
  }

  @Put('tapd/configs/:id')
  async updateConfig(@Param('id') id: string, @Body() dto: UpdateTapdConfigDto) {
    return this.tapdConfigService.update(id, dto);
  }

  @Delete('tapd/configs/:id')
  async removeConfig(@Param('id') id: string) {
    await this.tapdConfigService.remove(id);
    return { success: true };
  }

  @Post('tapd/configs/:id/set-default')
  async setDefaultConfig(@Param('id') id: string) {
    return this.tapdConfigService.setDefault(id);
  }

  // Project endpoints
  @Get('projects')
  async getProjects(@Query('workspaceId') workspaceId?: string) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchProjects(wid);
  }

  @Get('projects/:projectId/iterations')
  async getIterations(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchIterations(wid, projectId);
  }

  @Get('projects/:projectId/users')
  async getUsers(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchUsers(wid, projectId);
  }

  @Get('projects/:projectId/status-options')
  async getStatusOptions(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();

    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    const wid = workspaceId || config.workspaceId;
    this.tapdService.setConfig(config.apiUrl, wid);
    const [requirementStatusMap, bugStatusMap] = await Promise.all([
      this.tapdService.getStoryStatusLabelMap(wid),
      this.tapdService.getBugStatusLabelMap(wid),
    ]);

    return {
      requirementStatuses: buildTapdStatusOptions(requirementStatusMap),
      bugStatuses: buildTapdStatusOptions(bugStatusMap),
    };
  }

  @Get('projects/:projectId/versions')
  async getVersions(
    @Param('projectId') projectId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchVersions(wid, projectId);
  }

  // Requirements endpoint
  @Get('requirements')
  async getRequirements(
    @Query('projectId') projectId: string,
    @Query('iterationId') iterationId?: string,
    @Query('ownerIds') ownerIds?: string,
    @Query('status') status?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    const ownerIdsArray = ownerIds ? ownerIds.split(',') : undefined;

    return this.tapdService.fetchRequirements({
      workspaceId: wid,
      projectId,
      iterationId,
      ownerIds: ownerIdsArray,
      status,
    });
  }

  // Bugs endpoint
  @Get('bugs')
  async getBugs(
    @Query('projectId') projectId: string,
    @Query('iterationId') iterationId?: string,
    @Query('title') title?: string,
    @Query('versionId') versionId?: string,
    @Query('ownerIds') ownerIds?: string,
    @Query('status') status?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    const ownerIdsArray = ownerIds ? ownerIds.split(',') : undefined;

    return this.tapdService.fetchBugs({
      workspaceId: wid,
      projectId,
      iterationId,
      title,
      versionId,
      ownerIds: ownerIdsArray,
      status,
    });
  }

  // Todos endpoint
  @Get('todos/:userId')
  async getTodos(
    @Param('userId') userId: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const config = await this.tapdConfigService.findDefault();
    
    if (!config) {
      throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
    }

    const wid = workspaceId || config.workspaceId;
    // Set config for tapdService to use
    this.tapdService.setConfig(config.apiUrl, wid);
    return this.tapdService.fetchTodos(wid, userId);
  }

  @Get('tapd/detail-view')
  async getTapdDetailView(
    @Query('workspaceId') workspaceId: string,
    @Query('type') type: 'story' | 'bug',
    @Query('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const config = await this.tapdConfigService.findDefault();

      if (!config) {
        throw new NotFoundException('No TAPD configuration found. Please configure TAPD first.');
      }
      if (!workspaceId) {
        throw new BadRequestException('workspaceId is required');
      }
      if (type !== 'story' && type !== 'bug') {
        throw new BadRequestException('type must be story or bug');
      }
      if (!id) {
        throw new BadRequestException('id is required');
      }

      this.tapdService.setConfig(config.apiUrl, workspaceId);
      const detail = type === 'bug'
        ? await this.tapdService.fetchBugDetail(workspaceId, id)
        : await this.tapdService.fetchStoryDetail(workspaceId, id);

      if (!detail) {
        return res
          .status(404)
          .type('html')
          .send(renderTapdDetailErrorHtml('未找到对应的 TAPD 详情'));
      }

      return res
        .status(200)
        .type('html')
        .send(renderTapdDetailHtml(detail));
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const message = error instanceof Error ? error.message : '加载 TAPD 详情失败';
      return res
        .status(status)
        .type('html')
        .send(renderTapdDetailErrorHtml(message));
    }
  }
}

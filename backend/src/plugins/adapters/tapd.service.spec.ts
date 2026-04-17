import { applyTapdStatusFilter, buildTapdUserFilter, normalizeTapdQueryValues } from './tapd.service';

describe('tapd query helpers', () => {
  it('normalizes comma or pipe separated values', () => {
    expect(normalizeTapdQueryValues('open,testing|resolved')).toEqual(['open', 'testing', 'resolved']);
  });

  it('builds user or filter for multiple owners', () => {
    expect(buildTapdUserFilter(['zhouzhen', 'zhaodashuai', 'wanghaiquan'])).toBe(
      'USER_OR<zhouzhen|zhaodashuai|wanghaiquan>',
    );
  });

  it('keeps single owner filter as raw value', () => {
    expect(buildTapdUserFilter(['zhouzhen'])).toBe('zhouzhen');
  });

  it('applies english status filter to status field with enum OR syntax', () => {
    const queryParams: Record<string, string> = {};
    applyTapdStatusFilter(queryParams, ['open', 'testing']);

    expect(queryParams).toEqual({
      status: 'open|testing',
    });
  });

  it('applies chinese status filter to v_status field', () => {
    const queryParams: Record<string, string> = {};
    applyTapdStatusFilter(queryParams, ['进入技术攻关项目']);

    expect(queryParams).toEqual({
      v_status: '进入技术攻关项目',
    });
  });
});

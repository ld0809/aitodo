# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]: ✓
    - generic [ref=e7]: AI待办
  - heading "注册账号" [level=1] [ref=e8]
  - paragraph [ref=e9]: 创建您的账号，开始高效管理待办
  - generic [ref=e10]: 注册失败，请重试
  - generic [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]: 邮箱地址
      - textbox "your@email.com" [ref=e14]: test1772359038388@example.com
    - generic [ref=e15]:
      - generic [ref=e16]: 密码
      - textbox "至少8位，包含字母和数字" [ref=e17]: test1234
    - generic [ref=e18]:
      - generic [ref=e19]: 确认密码
      - textbox "再次输入密码" [ref=e20]: test1234
    - button "注册" [ref=e21] [cursor=pointer]
  - generic [ref=e22]:
    - text: 已有账号？
    - link "立即登录" [ref=e23] [cursor=pointer]:
      - /url: /login
```
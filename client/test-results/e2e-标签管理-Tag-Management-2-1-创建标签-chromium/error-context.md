# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]: ✓
    - generic [ref=e7]: AI待办
  - heading "登录账号" [level=1] [ref=e8]
  - paragraph [ref=e9]: 欢迎回来，继续您的待办管理
  - generic [ref=e10]:
    - generic [ref=e11]:
      - generic [ref=e12]: 邮箱地址
      - textbox "your@email.com" [ref=e13]
    - generic [ref=e14]:
      - generic [ref=e15]: 密码
      - textbox "输入密码" [ref=e16]
    - button "登录" [ref=e17] [cursor=pointer]
  - generic [ref=e18]:
    - text: 没有账号？
    - link "立即注册" [ref=e19] [cursor=pointer]:
      - /url: /register
```
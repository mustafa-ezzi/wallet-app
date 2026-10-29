try {
  document.documentElement.dataset.theme =
    localStorage.getItem('wallettrails_ops_theme') === 'dark' ? 'dark' : 'light'
} catch (e) {
  document.documentElement.dataset.theme = 'light'
}

/** GitHub Actions / CI 環境（Linux runner 無本機截圖基準，略過視覺比對） */
export function isCiEnvironment(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

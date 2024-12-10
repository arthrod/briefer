export function CircleProgress({
  percent,
  size = 16,
  strokeWidth = 2,
}: {
  percent: number
  size?: number
  strokeWidth?: number
}) {
  // 动态计算圆的半径和周长
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* SVG 圆形进度条 */}
      <svg
        style={{ transform: 'rotate(-90deg)' }}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}>
        {/* 背景圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e6e6e6"
          strokeWidth={strokeWidth}
        />
        {/* 进度圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2F69FE"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (percent / 100) * circumference}
          strokeLinecap="round"
        />
      </svg>
      {/* 百分比文本 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: size * 0.2,
          fontWeight: 'bold',
          color: '#007bff',
        }}></div>
    </div>
  )
}

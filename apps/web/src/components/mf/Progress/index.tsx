export function CircleProgress({ percent }: { percent: number }) {
  return (
    <div
      style={{
        width: '20px',
        height: '20px',
        border: '2px solid #2f69fe',
        borderRadius: '50%',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <div
        style={{
          position: 'absolute',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: `conic-gradient(#2f69fe ${percent}%, transparent ${percent}%)`,
        }}
      />
      <span
        style={{
          fontSize: '10px',
          color: '#2f69fe',
          zIndex: 1,
        }}></span>
    </div>
  )
}

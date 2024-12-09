export default function Avatar({ userId, username, online }) {
  const colors = [
    'bg-teal-200', 'bg-red-200', 'bg-green-200', 'bg-purple-200',
    'bg-blue-200', 'bg-yellow-200', 'bg-orange-200', 'bg-pink-200',
    'bg-fuchsia-200', 'bg-rose-200'
  ];

  // Safely parse the userId to avoid potential errors with shorter strings
  const userIdBase10 = userId ? parseInt(userId.slice(-6), 16) : 0;
  const colorIndex = userIdBase10 % colors.length;
  const color = colors[colorIndex];

  return (
    <div className={`w-8 h-8 relative rounded-full flex items-center justify-center ${color}`}>
      {username && (
        <span className="text-center w-full text-xs font-medium opacity-70">
          {username[0]?.toUpperCase() || ""}
        </span>
      )}
      <div
        className={`absolute w-3 h-3 rounded-full border border-white bottom-0 right-0 ${
          online ? 'bg-green-400' : 'bg-gray-400'
        }`}
      />
    </div>
  );
}

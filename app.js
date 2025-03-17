// Initialize WebSocket connection
const room = new WebsimSocket();

// React app
const { useState, useEffect, useRef, useMemo, useSyncExternalStore } = React;
const { createRoot } = ReactDOM;

const App = () => {
  const [isWelcomeVisible, setIsWelcomeVisible] = useState(true);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#ff4081');
  const [lineWidth, setLineWidth] = useState(5);
  const [isPanning, setIsPanning] = useState(false);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [drawingStarted, setDrawingStarted] = useState(false);

  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const musicRef = useRef(null);

  // Get real-time data
  const peers = useSyncExternalStore(
    room.party.subscribe,
    () => room.party.peers
  );

  const presence = useSyncExternalStore(
    room.party.subscribePresence,
    () => room.party.presence
  );

  const drawings = useSyncExternalStore(
    room.collection('drawing').subscribe,
    room.collection('drawing').getList
  );

  const startApp = () => {
    setIsWelcomeVisible(false);
    // Start the music
    if (musicRef.current) {
      musicRef.current.play().catch(err => console.log("Autoplay prevented:", err));
    }
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;

    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2); // For high DPI screens
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctxRef.current = ctx;

    // Set initial view to center
    setViewOffset({
      x: 0,
      y: 0
    });

    // Load existing drawings
    loadExistingDrawings();

    // Set up music reference
    musicRef.current = document.getElementById('backgroundMusic');

    // Update presence on mouse move
    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - canvasRect.left + viewOffset.x) / canvasRef.current.width * window.innerWidth;
      const y = (e.clientY - canvasRect.top + viewOffset.y) / canvasRef.current.height * window.innerHeight;
      
      room.party.updatePresence({
        cursorX: e.clientX,
        cursorY: e.clientY,
        canvasX: x,
        canvasY: y,
        color,
        lineWidth,
        tool
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    // Resize handler
    const handleResize = () => {
      if (!canvasRef.current || !ctxRef.current) return;
      canvas.width = window.innerWidth * 2;
      canvas.height = window.innerHeight * 2;
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      loadExistingDrawings();
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [viewOffset, color, lineWidth, tool]);

  const loadExistingDrawings = () => {
    if (!ctxRef.current) return;
    
    ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Draw all existing paths from the database
    drawings.forEach(drawing => {
      const path = JSON.parse(drawing.path);
      if (!path || !path.points || path.points.length < 2) return;
      
      const ctx = ctxRef.current;
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.lineWidth;
      
      const firstPoint = path.points[0];
      ctx.moveTo(firstPoint.x, firstPoint.y);
      
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      
      ctx.stroke();
    });
  };

  const startDrawing = (e) => {
    if (isWelcomeVisible) return;
    if (!canvasRef.current || !ctxRef.current) return;
    
    if (!drawingStarted) {
      setDrawingStarted(true);
      if (musicRef.current) {
        musicRef.current.play().catch(err => console.log("Autoplay prevented:", err));
      }
    }

    const { offsetX, offsetY } = getCoordinates(e);
    
    if (tool === 'pan') {
      setIsPanning(true);
      panStartRef.current = { 
        x: e.clientX - viewOffset.x, 
        y: e.clientY - viewOffset.y 
      };
      return;
    }
    
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(offsetX, offsetY);
    ctxRef.current.strokeStyle = tool === 'eraser' ? '#1e1e1e' : color;
    ctxRef.current.lineWidth = lineWidth;
    
    isDrawingRef.current = true;
    lastPosRef.current = { x: offsetX, y: offsetY };
    
    // Start a new path
    const currentPath = {
      color: tool === 'eraser' ? '#1e1e1e' : color,
      lineWidth,
      points: [{ x: offsetX, y: offsetY }]
    };
    
    // Store in temporary reference
    window.currentDrawingPath = currentPath;
  };

  const draw = (e) => {
    if (isWelcomeVisible) return;
    if (!canvasRef.current || !ctxRef.current) return;
    
    if (tool === 'pan' && isPanning) {
      const newOffsetX = e.clientX - panStartRef.current.x;
      const newOffsetY = e.clientY - panStartRef.current.y;
      setViewOffset({ x: newOffsetX, y: newOffsetY });
      return;
    }
    
    if (!isDrawingRef.current) return;
    
    const { offsetX, offsetY } = getCoordinates(e);
    
    ctxRef.current.lineTo(offsetX, offsetY);
    ctxRef.current.stroke();
    
    // Add point to the current path
    if (window.currentDrawingPath) {
      window.currentDrawingPath.points.push({ x: offsetX, y: offsetY });
    }
    
    lastPosRef.current = { x: offsetX, y: offsetY };
  };

  const stopDrawing = () => {
    if (isWelcomeVisible) return;
    if (!canvasRef.current || !ctxRef.current) return;
    
    if (tool === 'pan') {
      setIsPanning(false);
      return;
    }
    
    if (!isDrawingRef.current) return;
    
    isDrawingRef.current = false;
    
    // Save the path to database
    if (window.currentDrawingPath && window.currentDrawingPath.points.length > 1) {
      saveDrawing(window.currentDrawingPath);
      window.currentDrawingPath = null;
    }
  };

  const saveDrawing = async (path) => {
    try {
      await room.collection('drawing').create({
        path: JSON.stringify(path),
        x: viewOffset.x,
        y: viewOffset.y
      });
    } catch (err) {
      console.error('Error saving drawing:', err);
    }
  };

  const getCoordinates = (e) => {
    let clientX, clientY;
    
    // Handle touch events
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    return {
      offsetX: (clientX - canvasRect.left + viewOffset.x),
      offsetY: (clientY - canvasRect.top + viewOffset.y)
    };
  };

  // Handle touch events for mobile devices
  const handleTouchStart = (e) => {
    if (!canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    startDrawing(mouseEvent);
  };

  const handleTouchMove = (e) => {
    if (!canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    if (!isDrawingRef.current && !isPanning) return;
    
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    draw(mouseEvent);
  };

  const handleTouchEnd = (e) => {
    if (!canvasRef.current || !ctxRef.current) return;
    e.preventDefault();
    stopDrawing();
  };

  return (
    <>
      {isWelcomeVisible && (
        <div className="welcome-overlay">
          <h1>Infinite Canvas Art Studio</h1>
          <p>Join with others to create an endless masterpiece. Draw anything, anywhere, and see others drawing in real-time. Click the button to start, and the music will play!</p>
          <button className="start-btn" onClick={startApp}>Start Drawing</button>
        </div>
      )}
      
      <div className="canvas-container" ref={canvasContainerRef}>
        <canvas
          ref={canvasRef}
          className="infinite-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: `translate(${-viewOffset.x}px, ${-viewOffset.y}px)`
          }}
        ></canvas>
        
        {/* Render other users' cursors */}
        {Object.entries(presence).map(([clientId, data]) => {
          if (clientId === room.party.client.id || !data.cursorX) return null;
          
          return (
            <div
              key={clientId}
              className="user-cursor"
              style={{
                left: `${data.cursorX}px`,
                top: `${data.cursorY}px`,
              }}
            >
              <div 
                className="cursor-dot"
                style={{ backgroundColor: data.color }}
              ></div>
              <div className="cursor-name">
                {peers[clientId]?.username || 'User'}
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="toolbar">
        <button 
          className={`tool-btn ${tool === 'brush' ? 'active' : ''}`}
          onClick={() => setTool('brush')}
          title="Brush"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 3L21 6L8 19L3 14"></path>
          </svg>
        </button>
        
        <button 
          className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => setTool('eraser')}
          title="Eraser"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 20H4"></path>
            <path d="M18 6L12 12M12 12L6 18M12 12L18 18M12 12L6 6"></path>
          </svg>
        </button>
        
        <button 
          className={`tool-btn ${tool === 'pan' ? 'active' : ''}`}
          onClick={() => setTool('pan')}
          title="Pan Canvas"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"></path>
          </svg>
        </button>
        
        <div className="color-picker" style={{ backgroundColor: color }}>
          <input 
            type="color" 
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        
        <div className="size-slider">
          <input
            type="range"
            min="1"
            max="50"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
          />
        </div>
      </div>
      
      <div className="users-online">
        <h3>Artists Online ({Object.keys(peers).length})</h3>
        <div className="user-list">
          {Object.values(peers).map((peer) => (
            <div key={peer.id} className="user-item">
              <img 
                className="user-avatar" 
                src={`https://images.websim.ai/avatar/${peer.username}`} 
                alt={peer.username} 
              />
              <span>{peer.username}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// Render the App
const root = createRoot(document.getElementById('app'));
root.render(<App />);
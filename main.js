import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ===== مفاتيح التخزين =====
const STORAGE_KEY = 'home_designer_rooms_v1';
const FURNITURE_KEY = 'home_designer_furniture_v1';
let isLoading = false;

// ===== مكتبة الأثاث =====
const FURNITURE_LIBRARY = {
    sofa:   { name: 'كنبة',       icon: '🛋️', width: 2.0, height: 0.8, depth: 0.9, color: 0x8b5cf6 },
    bed:    { name: 'سرير',       icon: '🛏️', width: 2.0, height: 0.5, depth: 1.6, color: 0xef4444 },
    chair:  { name: 'كرسي',       icon: '🪑', width: 0.5, height: 0.9, depth: 0.5, color: 0xf59e0b },
    table:  { name: 'طاولة سفرة', icon: '🍽️', width: 1.6, height: 0.75, depth: 0.9, color: 0xa16207 },
    tv:     { name: 'تلفزيون',    icon: '📺', width: 1.2, height: 0.7, depth: 0.1, color: 0x1e293b },
    fridge: { name: 'ثلاجة',      icon: '❄️', width: 0.7, height: 1.8, depth: 0.7, color: 0xe2e8f0 },
    sink:   { name: 'حوض مطبخ',   icon: '🚰', width: 0.8, height: 0.9, depth: 0.6, color: 0x94a3b8 },
    toilet: { name: 'مرحاض',      icon: '🚽', width: 0.4, height: 0.8, depth: 0.6, color: 0xf1f5f9 }
};

// ===== حالة الرسم =====
const state = {
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    rooms: [],
    previewMesh: null
};

const furnitureState = {
    items: [],
    selected: null,
    placingType: null
};

const WALL_HEIGHT = 2.8;
const WALL_THICKNESS = 0.15;
const WALL_COLOR = 0x8892a6;

// ===== عناصر الواجهة =====
const roomPanel = document.getElementById('room-panel');
const roomTypeSelect = document.getElementById('room-type');
const roomAreaSpan = document.getElementById('room-area');
const closePanelBtn = document.getElementById('close-panel');
const furniturePanel = document.getElementById('furniture-panel');
const furnitureGrid = document.getElementById('furniture-grid');
const closeFurnitureBtn = document.getElementById('close-furniture');

// ===== إعداد المشهد =====
const container = document.getElementById('scene-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f1e);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// ===== إضاءة =====
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ===== أرضية =====
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a4a,
    roughness: 0.8,
    metalness: 0.1
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(20, 20, 0x0f3460, 0x16213e);
grid.position.y = 0.01;
scene.add(grid);

// ===== Raycaster =====
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function getGroundPoint(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(ground);
    
    if (intersects.length > 0) {
        return intersects[0].point;
    }
    return null;
}

// ===== مؤشر بصري =====
const cursorGeometry = new THREE.CircleGeometry(0.15, 16);
const cursorMaterial = new THREE.MeshBasicMaterial({
    color: 0xe94560,
    side: THREE.DoubleSide
});
const cursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
cursor.rotation.x = -Math.PI / 2;
cursor.position.y = 0.02;
cursor.visible = false;
scene.add(cursor);

// ===== نظام الكاميرا =====
const orbit = {
    target: new THREE.Vector3(0, 0, 0),
    radius: 12,
    theta: Math.PI / 4,
    phi: Math.PI / 3
};

function updateCamera() {
    const x = orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
    const y = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
    const z = orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
    camera.position.set(x, y, z);
    camera.lookAt(orbit.target);
}

updateCamera();

// ===== حالة اللمس =====
let touchStartPos = { x: 0, y: 0, time: 0 };
let touchMoved = false;
const TAP_THRESHOLD = 10;
let orbitSnapshot = null;
let touchMode = 'none';
let lastPinchDist = 0;
let lastPinchCenter = { x: 0, y: 0 };

// ===== رسم معاينة الغرفة =====
function updatePreview() {
    if (!state.startPoint || !state.currentPoint) return;
    
    if (state.previewMesh) {
        scene.remove(state.previewMesh);
        state.previewMesh.geometry.dispose();
        state.previewMesh.material.dispose();
        state.previewMesh = null;
    }
    
    const x1 = state.startPoint.x;
    const z1 = state.startPoint.z;
    const x2 = state.currentPoint.x;
    const z2 = state.currentPoint.z;
    
    const width = Math.abs(x2 - x1);
    const depth = Math.abs(z2 - z1);
    
    if (width < 0.1 || depth < 0.1) return;
    
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    
    const geo = new THREE.PlaneGeometry(width, depth);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xe94560,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
    });
    
    state.previewMesh = new THREE.Mesh(geo, mat);
    state.previewMesh.rotation.x = -Math.PI / 2;
    state.previewMesh.position.set(centerX, 0.03, centerZ);
    scene.add(state.previewMesh);
}

// ===== بداية السحب =====
function onTouchStart(clientX, clientY) {
    touchStartPos = { x: clientX, y: clientY, time: Date.now() };
    touchMoved = false;
    
    orbitSnapshot = {
        theta: orbit.theta,
        phi: orbit.phi,
        radius: orbit.radius
    };
    
    const point = getGroundPoint(clientX, clientY);
    if (!point) return;
    
    state.isDrawing = true;
    state.startPoint = point.clone();
    state.currentPoint = point.clone();
    
    cursor.position.set(point.x, 0.02, point.z);
    cursor.visible = true;
}

// ===== أثناء السحب =====
function onTouchMove(clientX, clientY) {
    if (state.isDrawing && orbitSnapshot) {
        orbit.theta = orbitSnapshot.theta;
        orbit.phi = orbitSnapshot.phi;
        orbit.radius = orbitSnapshot.radius;
        updateCamera();
    }
    
    const dx = clientX - touchStartPos.x;
    const dy = clientY - touchStartPos.y;
    if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
        touchMoved = true;
    }
    
    const point = getGroundPoint(clientX, clientY);
    if (!point) return;
    
    cursor.position.set(point.x, 0.02, point.z);
    
    if (state.isDrawing) {
        state.currentPoint = point.clone();
        if (touchMoved) {
            updatePreview();
        }
    }
}

// ===== نهاية السحب =====
function onTouchEnd(clientX, clientY) {
    // وضع إضافة الأثاث: ضغطة واحدة = وضع القطعة
    if (furnitureState.placingType && !touchMoved) {
        const point = getGroundPoint(clientX || touchStartPos.x, clientY || touchStartPos.y);
        if (point) {
            createFurniture(furnitureState.placingType, point.x, point.z, 0);
            furnitureState.placingType = null;
            document.body.style.cursor = '';
        }
        state.isDrawing = false;
        state.startPoint = null;
        state.currentPoint = null;
        cursor.visible = false;
        orbitSnapshot = null;
        return;
    }
    
    if (!touchMoved && state.isDrawing) {
        const room = getRoomAtPoint(clientX || touchStartPos.x, clientY || touchStartPos.y);
        if (room) {
            selectRoom(room);
        } else {
            deselectRoom();
        }
    } else if (state.isDrawing && state.startPoint && state.currentPoint) {
        const x1 = state.startPoint.x;
        const z1 = state.startPoint.z;
        const x2 = state.currentPoint.x;
        const z2 = state.currentPoint.z;
        
        const width = Math.abs(x2 - x1);
        const depth = Math.abs(z2 - z1);
        
        if (width >= 0.5 && depth >= 0.5) {
            createRoom(x1, z1, x2, z2);
            saveToStorage();
        }
    }
    
    state.isDrawing = false;
    state.startPoint = null;
    state.currentPoint = null;
    cursor.visible = false;
    orbitSnapshot = null;
    
    if (state.previewMesh) {
        scene.remove(state.previewMesh);
        state.previewMesh.geometry.dispose();
        state.previewMesh.material.dispose();
        state.previewMesh = null;
    }
}

// ===== إنشاء غرفة =====
function createRoom(x1, z1, x2, z2, skipSave, roomType) {
    const width = Math.abs(x2 - x1);
    const depth = Math.abs(z2 - z1);
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    
    const roomGroup = new THREE.Group();
    
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x3a3a5a,
        roughness: 0.7
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centerX, 0.04, centerZ);
    roomGroup.add(floor);
    
    const wallMat = new THREE.MeshStandardMaterial({
        color: WALL_COLOR,
        roughness: 0.9
    });
    
    const wallN = new THREE.Mesh(
        new THREE.BoxGeometry(width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
        wallMat.clone()
    );
    wallN.position.set(centerX, WALL_HEIGHT / 2, centerZ - depth / 2);
    roomGroup.add(wallN);
    
    const wallS = new THREE.Mesh(
        new THREE.BoxGeometry(width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
        wallMat.clone()
    );
    wallS.position.set(centerX, WALL_HEIGHT / 2, centerZ + depth / 2);
    roomGroup.add(wallS);
    
    const wallW = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, depth),
        wallMat.clone()
    );
    wallW.position.set(centerX - width / 2, WALL_HEIGHT / 2, centerZ);
    roomGroup.add(wallW);
    
    const wallE = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, depth),
        wallMat.clone()
    );
    wallE.position.set(centerX + width / 2, WALL_HEIGHT / 2, centerZ);
    roomGroup.add(wallE);
    
    scene.add(roomGroup);
    
    const roomData = {
        id: Date.now() + Math.random(),
        x1, z1, x2, z2,
        width,
        depth,
        area: width * depth,
        type: roomType || 'غرفة',
        group: roomGroup,
        floor: floor,
        walls: [wallN, wallS, wallW, wallE]
    };
    state.rooms.push(roomData);
    
    if (!skipSave) {
        saveToStorage();
    }
    
    return roomData;
}

// ===== إنشاء قطعة أثاث =====
function createFurniture(type, x, z, rotation = 0, skipSave = false) {
    const data = FURNITURE_LIBRARY[type];
    if (!data) return null;
    
    const group = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(data.width, data.height, data.depth);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.7,
        metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = data.height / 2;
    body.userData.isFurnitureBody = true;
    group.add(body);
    
    if (type === 'sofa') {
        const backGeo = new THREE.BoxGeometry(data.width, 0.4, 0.15);
        const backMat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.8 });
        const back = new THREE.Mesh(backGeo, backMat);
        back.position.set(0, data.height - 0.2, -data.depth / 2 + 0.075);
        group.add(back);
    }
    
    if (type === 'bed') {
        const pillowGeo = new THREE.BoxGeometry(0.6, 0.15, 0.4);
        const pillowMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.9 });
        const pillow = new THREE.Mesh(pillowGeo, pillowMat);
        pillow.position.set(0, data.height + 0.075, -data.depth / 2 + 0.4);
        group.add(pillow);
    }
    
    if (type === 'fridge') {
        const handleGeo = new THREE.BoxGeometry(0.05, 0.4, 0.05);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        handle.position.set(0.25, 0.4, data.depth / 2 + 0.025);
        group.add(handle);
    }
    
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    
    scene.add(group);
    
    const item = {
        id: Date.now() + Math.random(),
        type: type,
        x: x,
        z: z,
        rotation: rotation,
        group: group,
        body: body
    };
    
    furnitureState.items.push(item);
    
    if (!skipSave) {
        saveToStorage();
    }
    
    return item;
}

// ===== تحديد الغرف =====
let selectedRoom = null;

function getRoomAtPoint(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(pointer, camera);
    
    const floorMeshes = state.rooms.map(r => r.floor);
    const intersects = raycaster.intersectObjects(floorMeshes);
    
    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        return state.rooms.find(r => r.floor === hitMesh);
    }
    return null;
}

function selectRoom(room) {
    if (selectedRoom && selectedRoom.id === room.id) {
        deselectRoom();
        return;
    }
    
    deselectRoom();
    selectedRoom = room;
    
    room.walls.forEach(wall => {
        wall.userData.originalColor = wall.material.color.getHex();
        wall.material.color.setHex(0xe94560);
    });
    
    roomTypeSelect.value = room.type || 'غرفة';
    roomAreaSpan.textContent = room.area.toFixed(1);
    roomPanel.classList.remove('hidden');
}

function deselectRoom() {
    if (selectedRoom) {
        selectedRoom.walls.forEach(wall => {
            if (wall.userData.originalColor !== undefined) {
                wall.material.color.setHex(wall.userData.originalColor);
            }
        });
        selectedRoom = null;
    }
    roomPanel.classList.add('hidden');
}

function deleteSelectedRoom() {
    if (!selectedRoom) return;
    
    scene.remove(selectedRoom.group);
    selectedRoom.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
    
    const idx = state.rooms.indexOf(selectedRoom);
    if (idx > -1) state.rooms.splice(idx, 1);
    
    selectedRoom = null;
    roomPanel.classList.add('hidden');
    saveToStorage();
}

// ===== أحداث اللوحة =====
roomTypeSelect.addEventListener('change', () => {
    if (selectedRoom) {
        selectedRoom.type = roomTypeSelect.value;
        saveToStorage();
    }
});

closePanelBtn.addEventListener('click', () => {
    deselectRoom();
});

// ===== مكتبة الأثاث UI =====
function buildFurnitureGrid() {
    if (!furnitureGrid) return;
    furnitureGrid.innerHTML = '';
    
    Object.keys(FURNITURE_LIBRARY).forEach(type => {
        const data = FURNITURE_LIBRARY[type];
        const btn = document.createElement('button');
        btn.className = 'furniture-item';
        btn.innerHTML = `
            <span class="furniture-icon">${data.icon}</span>
            <span class="furniture-name">${data.name}</span>
        `;
        btn.addEventListener('click', () => {
            startPlacingFurniture(type);
        });
        furnitureGrid.appendChild(btn);
    });
}

// ===== وضع الأثاث في المكان اللي تختاره =====
function startPlacingFurniture(type) {
    furnitureState.placingType = type;
    
    // اقفل القائمة
    furniturePanel.classList.add('hidden');
    
    // فعّل أداة الأثاث
    document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="furniture"]').classList.add('active');
    
    // غيّر لون المؤشر
    cursor.material.color.setHex(0x2ecc71);
    cursor.visible = true;
    
    // رسالة مؤقتة
    showToast(`اضغط على المكان لوضع ${FURNITURE_LIBRARY[type].name}`);
}

// ===== رسالة Toast بسيطة =====
function showToast(message) {
    const existing = document.getElementById('toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(46, 204, 113, 0.95);
        color: #fff;
        padding: 12px 20px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        z-index: 9999;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        animation: toastIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===== دوال اللمس المساعدة =====
function getPinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

function getPinchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

// ===== مستمعو اللمس =====
renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchMode = 'draw';
        onTouchStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
        if (touchMode === 'draw') onTouchEnd();
        touchMode = 'orbit';
        lastPinchDist = getPinchDist(e.touches);
        lastPinchCenter = getPinchCenter(e.touches);
    }
}, { passive: true });

renderer.domElement.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && touchMode === 'draw') {
        e.preventDefault();
        onTouchMove(e.touches[0].clientX, e.touches[0].clientY);
        return;
    }
    
    if (e.touches.length === 2 && touchMode === 'orbit') {
        e.preventDefault();
        
        const newDist = getPinchDist(e.touches);
        const newCenter = getPinchCenter(e.touches);
        
        const scale = lastPinchDist / newDist;
        orbit.radius = Math.max(4, Math.min(30, orbit.radius * scale));
        
        const dx = newCenter.x - lastPinchCenter.x;
        const dy = newCenter.y - lastPinchCenter.y;
        
        orbit.theta -= dx * 0.01;
        orbit.phi -= dy * 0.01;
        orbit.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, orbit.phi));
        
        updateCamera();
        
        lastPinchDist = newDist;
        lastPinchCenter = newCenter;
    }
}, { passive: false });

renderer.domElement.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        if (touchMode === 'draw') {
            onTouchEnd();
        }
        touchMode = 'none';
    }
}, { passive: true });

// ===== تغيير الحجم =====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCamera();
});

// ===== أزرار الأدوات =====
document.querySelectorAll('.tool').forEach(btn => {
    btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        
        if (tool === 'delete') {
            deleteSelectedRoom();
        } else if (tool === 'furniture') {
            furniturePanel.classList.toggle('hidden');
            deselectRoom();
            furnitureState.placingType = null;
            cursor.visible = false;
        } else {
            furniturePanel.classList.add('hidden');
            furnitureState.placingType = null;
            cursor.visible = false;
            
            document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });
});

if (closeFurnitureBtn) {
    closeFurnitureBtn.addEventListener('click', () => {
        furniturePanel.classList.add('hidden');
    });
}

buildFurnitureGrid();

// ===== الحفظ والتحميل =====
function saveToStorage() {
    if (isLoading) return;
    try {
        const roomsData = state.rooms.map(r => ({
            x1: r.x1, z1: r.z1,
            x2: r.x2, z2: r.z2,
            type: r.type
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(roomsData));
        
        const furnitureData = furnitureState.items.map(f => ({
            type: f.type,
            x: f.x,
            z: f.z,
            rotation: f.rotation
        }));
        localStorage.setItem(FURNITURE_KEY, JSON.stringify(furnitureData));
    } catch (err) {
        console.error('❌ فشل الحفظ:', err);
    }
}

function loadFromStorage() {
    try {
        isLoading = true;
        
        const roomsRaw = localStorage.getItem(STORAGE_KEY);
        if (roomsRaw) {
            const roomsData = JSON.parse(roomsRaw);
            if (Array.isArray(roomsData)) {
                roomsData.forEach(room => {
                    createRoom(room.x1, room.z1, room.x2, room.z2, true, room.type);
                });
            }
        }
        
        const furnitureRaw = localStorage.getItem(FURNITURE_KEY);
        if (furnitureRaw) {
            const furnitureData = JSON.parse(furnitureRaw);
            if (Array.isArray(furnitureData)) {
                furnitureData.forEach(f => {
                    createFurniture(f.type, f.x, f.z, f.rotation, true);
                });
            }
        }
        
        isLoading = false;
    } catch (err) {
        isLoading = false;
        console.error('❌ فشل التحميل:', err);
    }
}

function manualSave() {
    saveToStorage();
    const btn = document.getElementById('btn-save');
    if (btn) {
        const original = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
            btn.textContent = original;
        }, 1200);
    }
}

document.getElementById('btn-save')?.addEventListener('click', manualSave);

loadFromStorage();

// ===== حلقة الرسم =====
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

// ===== CSS للـ Toast =====
const style = document.createElement('style');
style.textContent = `
    @keyframes toastIn {
        from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
`;

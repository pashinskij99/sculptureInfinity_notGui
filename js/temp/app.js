const Vector3 = THREE.Vector3
const Curve = THREE.Curve
const globalVal = {
   size: null,
   points: false,
   oldPoints: false,
   lastMaterial: null,
   vg: null,
   lastMesh: null,
   renderObj: null,
   guiMenuIsCreate: null,
   isTimeGenerate: false,
   trackballControls: null
}

let SCENE = null;

function CubicPoly() {
   let c0 = 0,
      c1 = 0,
      c2 = 0,
      c3 = 0
   /*
    * Compute coefficients for a cubic polynomial
    *   p(s) = c0 + c1*s + c2*s^2 + c3*s^3
    * such that
    *   p(0) = x0, p(1) = x1
    *  and
    *   p'(0) = t0, p'(1) = t1.
    */
   function init(x0, x1, t0, t1) {
      c0 = x0
      c1 = t0
      c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1
      c3 = 2 * x0 - 2 * x1 + t0 + t1
   }
   return {
      initCatmullRom: function (x0, x1, x2, x3, tension) {
         init(x1, x2, tension * (x2 - x0), tension * (x3 - x1))
      },
      initNonuniformCatmullRom: function (x0, x1, x2, x3, dt0, dt1, dt2) {
         // compute tangents when parameterized in [t1,t2]
         let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1
         let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2
         // rescale tangents for parametrization in [0,1]
         t1 *= dt1
         t2 *= dt1
         init(x1, x2, t1, t2)
      },
      calc: function (t) {
         const t2 = t * t
         const t3 = t2 * t
         return c0 + c1 * t + c2 * t2 + c3 * t3
      },
   }
}
const tmp = new Vector3()
const px = new CubicPoly(),
   py = new CubicPoly(),
   pz = new CubicPoly()

class CatmullRomCurve3 extends Curve {
   constructor(
      points = [],
      closed = false,
      curveType = 'centripetal',
      tension = 0.5
   ) {
      super()

      this.type = 'CatmullRomCurve3'

      this.points = points
      this.closed = closed
      this.curveType = curveType
      this.tension = tension
   }

   getPoint(t, optionalTarget = new Vector3()) {
      const point = optionalTarget

      const points = this.points
      const l = points.length

      const p = (l - (this.closed ? 0 : 1)) * t
      let intPoint = Math.floor(p)
      let weight = p - intPoint

      if (this.closed) {
         intPoint +=
            intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l
      } else if (weight === 0 && intPoint === l - 1) {
         intPoint = l - 2
         weight = 1
      }

      let p0, p3 // 4 points (p1 & p2 defined below)

      if (this.closed || intPoint > 0) {
         p0 = points[(intPoint - 1) % l]
      } else {
         // extrapolate first point
         tmp.subVectors(points[0], points[1]).add(points[0])
         p0 = tmp
      }

      const p1 = points[intPoint % l]
      const p2 = points[(intPoint + 1) % l]

      if (this.closed || intPoint + 2 < l) {
         p3 = points[(intPoint + 2) % l]
      } else {
         // extrapolate last point
         tmp.subVectors(points[l - 1], points[l - 2]).add(points[l - 1])
         p3 = tmp
      }

      if (this.curveType === 'centripetal' || this.curveType === 'chordal') {
         // init Centripetal / Chordal Catmull-Rom
         const pow = this.curveType === 'chordal' ? 0.5 : 0.25
         let dt0 = Math.pow(p0.distanceToSquared(p1), pow)
         let dt1 = Math.pow(p1.distanceToSquared(p2), pow)
         let dt2 = Math.pow(p2.distanceToSquared(p3), pow)

         // safety check for repeated points
         if (dt1 < 1e-4) dt1 = 1.0
         if (dt0 < 1e-4) dt0 = dt1
         if (dt2 < 1e-4) dt2 = dt1

         px.initNonuniformCatmullRom(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2)
         py.initNonuniformCatmullRom(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2)
         pz.initNonuniformCatmullRom(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2)
      } else if (this.curveType === 'catmullrom') {
         px.initCatmullRom(p0.x, p1.x, p2.x, p3.x, this.tension)
         py.initCatmullRom(p0.y, p1.y, p2.y, p3.y, this.tension)
         pz.initCatmullRom(p0.z, p1.z, p2.z, p3.z, this.tension)
      }

      point.set(px.calc(weight), py.calc(weight), pz.calc(weight))

      return point
   }

   copy(source) {
      super.copy(source)

      this.points = []

      for (let i = 0, l = source.points.length; i < l; i++) {
         const point = source.points[i]

         this.points.push(point.clone())
      }

      this.closed = source.closed
      this.curveType = source.curveType
      this.tension = source.tension

      return this
   }

   toJSON() {
      const data = super.toJSON()

      data.points = []

      for (let i = 0, l = this.points.length; i < l; i++) {
         const point = this.points[i]
         data.points.push(point.toArray())
      }

      data.closed = this.closed
      data.curveType = this.curveType
      data.tension = this.tension

      return data
   }

   fromJSON(json) {
      super.fromJSON(json)

      this.points = []

      for (let i = 0, l = json.points.length; i < l; i++) {
         const point = json.points[i]
         this.points.push(new Vector3().fromArray(point))
      }

      this.closed = json.closed
      this.curveType = json.curveType
      this.tension = json.tension

      return this
   }
}

CatmullRomCurve3.prototype.isCatmullRomCurve3 = true

var Apps = function () {
   var container, stats

   var camera, scene, renderer
   var group, group1

   var targetRotation = 5.2
   var targetRotationOnMouseDown = 0

   var exporter = new THREE.STLExporter()

   var mouseX = 0
   var mouseXOnMouseDown = 0

   var windowHalfX = window.innerWidth / 2
   var windowHalfY = window.innerHeight / 2
   const plastic = THREE.ImageUtils.loadTexture('img/plastic.jpg', false)
   var controls,
      translBlock = 'back',
      dftMaterial = new THREE.MeshPhongMaterial({
         side: THREE.DoubleSide,
         shading: THREE.SmoothShading,
         opacity: 1,
         map: plastic,
         emissive: 0x8f8f8f,
         color: 0xffffff,
      }),
      varlastMater,
      lastMater,
      texture1,
      metal,
      lastFon,
      fon = [],
      countOfPoints = 20,
      points = false

   class CustomSinCurve extends THREE.Curve {

      constructor( scale = 1 ) {
   
         super();
   
         this.scale = scale;
   
      }
   
      getPoint( t, optionalTarget = new THREE.Vector3() ) {
   
         const tx = t * 1 - 1.5;
         const ty = 0;
         const tz = 0;
   
         return optionalTarget.set( tx, ty, tz ).multiplyScalar( this.scale );
      }
   
   }
   class SpecialCurveLine {
      constructor(options = {}) {
            this.cycles = options.cycles || Math.PI * 15
            this.pointA = options.pointA || new THREE.Vector3(0, 11100, 0)
            this.pointB = options.pointB || new THREE.Vector3(0, -11100, 0)

            this.nurbsDegree = 3

            if (THREE.Object3D) {
               this.obj = new THREE.Object3D()
            }
            this.points = this.generatePoints(5)
            this.curve = this.generateCurve()
            this.mesh = this.getMesh()

            this.size = globalVal.size

            this.mesh.meshForShadow.scale.set(0.3, 0.3, 0.3)
            this.mesh.meshForShadow.material.transparent = true
            this.mesh.meshForShadow.material.opacity = 0
            this.obj.add(this.mesh.mesh, this.mesh.meshForShadow)

            this.mesh.meshForShadow.castShadow = true

            this.generateSegmentsLength()
      }

      translateGrometry(geometry, offset) {
         for (const nextVertex of geometry.vertices) {
            nextVertex.add(offset)
         }
         geometry.computeBoundingBox()
         geometry.computeBoundingSphere()
         return geometry
      }

      patchGeometry(rad, tubeGeometry, points) {
         const splinePointA = points.points[0]
         const splinePointB = points.points[points.points.length - 1]
         let spherePatchA = new THREE.SphereGeometry(rad, 10, 10)
         spherePatchA = this.translateGrometry(spherePatchA, splinePointA)
         tubeGeometry.merge(spherePatchA)
         let spherePatchB = new THREE.SphereGeometry(rad, 10, 10)
         spherePatchB = this.translateGrometry(spherePatchB, splinePointB)
         tubeGeometry.merge(spherePatchB)

         return tubeGeometry
      }

      getGeometry(size, val) {
         globalVal.points =
                globalVal.points && globalVal.oldPoints
                    ? globalVal.points
                    : this.nextCurve
         const rad = globalVal.size ? globalVal.size : 3
         let nextGeometry = new THREE.TubeGeometry( globalVal.points, 256, rad, 16)
         // nextGeometry = new THREE.BufferGeometry().fromGeometry( nextGeometry );
         // let nMax = nextGeometry.attributes.position.count;
         nextGeometry = this.patchGeometry(rad, nextGeometry, globalVal.points )
         return nextGeometry
      }

      getMaterial() {
         switch (globalVal.lastMaterial) {
            case 'metal':
               return {
                  material: new THREE.MeshPhongMaterial({
                  shininess: 30,
                  shading: THREE.SmoothShading,
                  vertexColors: false,
                  blending: THREE.AdditiveBlending,
                  map: globalVal.vg,
                  reflectivity: 0.05,
                  bumpMap: texture1,
                  bumpScale: 8.92,
                  side: THREE.DoubleSide,
               }) ,
                  materialForShadowMesh: new THREE.MeshPhongMaterial({
                     shininess: 30,
                     shading: THREE.SmoothShading,
                     vertexColors: false,
                     blending: THREE.AdditiveBlending,
                     map: globalVal.vg,
                     reflectivity: 0.05,
                     bumpMap: texture1,
                     bumpScale: 8.92,
                     side: THREE.DoubleSide,
                  })
               }
               break
            default:
               return {
                  material: new THREE.MeshPhongMaterial({
                     side: THREE.DoubleSide,
                     shading: THREE.SmoothShading,
                     opacity: 1,
                     map: plastic,
                     emissive: 0x8f8f8f,
                     color: 0xffffff,
                  }),
                  materialForShadowMesh: new THREE.MeshPhongMaterial({
                     side: THREE.DoubleSide,
                     shading: THREE.SmoothShading,
                     opacity: 1,
                     map: plastic,
                     emissive: 0x8f8f8f,
                     color: 0xffffff,
                  })
               }
         }
      }
      getMesh() {
         this.geometry = this.getGeometry()
         this.material = this.getMaterial()
         this.mesh = new THREE.Mesh(this.geometry, this.material.material)
         this.meshForShadow = new THREE.Mesh(this.geometry, this.material.materialForShadowMesh)
         globalVal.lastMesh = this.mesh
         return {
            mesh: this.mesh,
            meshForShadow: this.meshForShadow
         }
      }

      meshTestPoints() {
         for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i]

            const colorAlpha = i / this.points.length

            const nextColor = new THREE.Color(colorAlpha, 0, 0)

            const nextTestSphere = new THREE.Mesh(
               new THREE.SphereGeometry(12, 3, 3),
               new THREE.MeshPhongMaterial({
                  color: 0x000000,
                  emissive: nextColor,
                  metalness: 0,
                  roughness: 1,
                  wireframe: true,
               })
            )

            nextTestSphere.position.copy(point)

            this.obj.add(nextTestSphere)
         }
      }

      getToCenterPositions( segment ){

         const currentVector = segment[ 1 ].clone().sub( segment[ 0 ].clone() );
         const currentNormal = currentVector.clone();
         currentNormal.normalize();
         const distance = segment[ 1 ].distanceTo( segment[ 0 ] ) * .55;

         let currentPoint = segment[ 1 ].clone().sub( currentNormal.clone().multiplyScalar( 0 ) );
         let nextNormal = currentNormal.clone();
         let currentDistance = distance;

         const minDistance = distance * 0.2;
         const distanceRange = ( distance - minDistance ) * 1.5;
         const getDistance = ( alpha ) => {
            return minDistance  + ( distanceRange * alpha );
         };

         const steps = 12;

         const points = [ segment[ 1 ].clone() ];

         for( let i = 0; i < steps; i++  ){

            const nextAttractor = currentPoint.clone();
            nextAttractor.normalize();
            nextAttractor.negate();

            const nextCurvePower = nextAttractor.distanceTo( nextNormal );
            nextNormal = nextNormal.lerp( nextAttractor, 0.05 * nextCurvePower);
            currentDistance = Math.min( getDistance( nextCurvePower ), currentPoint.length() );
            currentDistance =  getDistance( nextCurvePower );

            const nextAddon = nextNormal.clone().multiplyScalar( currentDistance );

            currentPoint.add( nextAddon );

            points.push( currentPoint.clone() );
         }

         points.shift()

         return points;
      }

      generateCurve() {
         const points = [];

         for (const nextPoint of this.points) {
            points.push(
                new THREE.Vector3(nextPoint.x, nextPoint.y, nextPoint.z)
            )
         }

         points.push(
             new THREE.Vector3(0, 0, 0)
         )

         points.unshift(
             new THREE.Vector3(0, 0, 0)
         )

         let nextCurve = new CatmullRomCurve3(
             points,
             false,
             'catmullrom',
             0.9
         ) // 1 круглые  // 0.7 более ровные

         // points.pop()

         const halfPathPoints = nextCurve.getPoints( 50 );
         // console.log( {
         //    halfPathPoints
         // } );

         // const startSegment = [
         //    this.points[ 1 ].clone(),
         //    this.points[ 0 ].clone()
         // ];
         //
         // const endSegment = [
         //    this.points[ this.points.length - 2 ].clone(),
         //    this.points[ this.points.length - 1 ].clone()
         // ];
         //
         const startSegment = [
            halfPathPoints[ 1 ].clone(),
            halfPathPoints[ 0 ].clone()
         ];

         const endSegment = [
            halfPathPoints[ halfPathPoints.length - 2 ].clone(),
            halfPathPoints[ halfPathPoints.length - 1 ].clone()
         ];

         // const prePoints = this.getToCenterPositions( startSegment );
         // const postPoints = this.getToCenterPositions( endSegment );

         this.pointsForStartTube = []
         this.pointsForLastTube = []

         // for( const nextPrePoint of prePoints ){
         //    halfPathPoints.unshift( nextPrePoint );
         //    // this.pointsForStartTube.push( nextPrePoint );
         // }
         //
         // for( const nextPostPoint of postPoints ){
         //    halfPathPoints.push( nextPostPoint );
         //    // this.pointsForLastTube.push( nextPostPoint );
         // }

         nextCurve = new CatmullRomCurve3(
             halfPathPoints,
             false,
         ) // 1 круглые  // 0.7 более ровные

         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()
         halfPathPoints.pop()

         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()
         halfPathPoints.shift()

         this.nextCurve = nextCurve
      }

      generateNurbsKnotsByPoints() {
         const nurbsKnots = []
         for (let i = 0; i < this.points.length; i++) {
            const knot = (i + 1) / (this.points.length - this.nurbsDegree)
            nurbsKnots.push(THREE.Math.clamp(knot, 0, 1))
         }
         return nurbsKnots
      }

      getAvailableRandomPoint(yOffset, yAddOff, maxDistanceToCenter) {
         const nextRandomPoint = new THREE.Vector3(
            -0.5 + Math.random(),
            -0.5 + Math.random(),
            -0.5 + Math.random()
         )
         nextRandomPoint.normalize()
         nextRandomPoint.multiplyScalar(
            maxDistanceToCenter * (0.3 + Math.random() * 0.7)
         )
         nextRandomPoint.y += yOffset + yAddOff
         return nextRandomPoint
      }

      generateSegmentsLength() {
         const minimalLength = 1155
         const maximumLength = 1220
         const availableLineLength = 1500
         let nextSegmentsPackSignature = Math.random() > 0.5 ? 1 : -1 // 1 \ -1
         const getRandomRange = (_min, _max) => {
            const a = Math.min(_min, _max)
            const b = Math.max(_min, _max)
            return a + (b - a) * Math.random()
         }
         const segments = [getRandomRange(5, 10)]
         let currentLineLength = 0
         let lastSegmentLength = segments[0]
         const createNextSegmentsPack = (
            nextSegmentsCount,
            lastSegmentLength,
            nextWay
         ) => {
            const nextSegmentsPack = []
            let segmentLength_forLastGenerated = nextWay
               ? getRandomRange(lastSegmentLength, maximumLength)
               : getRandomRange(minimalLength, lastSegmentLength)
            for (let i = 0; i < nextSegmentsCount; i++) {
               const alpha = i / nextSegmentsCount
               const nextSegment =
                  lastSegmentLength +
                  (segmentLength_forLastGenerated - lastSegmentLength) * alpha
               nextSegmentsPack.push(nextSegment)
            }
            return nextSegmentsPack
         }

         const finallySegments = []

         let test = 1115
         let needStop

         while (currentLineLength < availableLineLength) {
            if (!test) {
               break
            } else {
               test--
            }
            const nextSegmentsCount = 3 + Math.floor(Math.random() * 7)
            const nextSegments = createNextSegmentsPack(
               nextSegmentsCount,
               lastSegmentLength,
               nextSegmentsPackSignature
            )
            for (const nextSegmentOfSegmentsPack of nextSegments) {
               if (
                  currentLineLength + nextSegmentOfSegmentsPack <
                  availableLineLength
               ) {
                  finallySegments.push(nextSegmentOfSegmentsPack)
                  currentLineLength += nextSegmentOfSegmentsPack
                  lastSegmentLength = nextSegmentOfSegmentsPack
               } else {
                  needStop = true
                  break
               }
            }
            if (needStop) {
               break
            }
            nextSegmentsPackSignature = !nextSegmentsPackSignature
         }

         for (const a of finallySegments) {
         }

         return finallySegments
      }

      filterPointsArray(minLength, pointsPath, finallyPointsPath) {
         while (pointsPath.length) {
            const nextPoint = pointsPath.shift()
            if (finallyPointsPath.length > 1) {
               // 160
               if (
                  finallyPointsPath.filter((a) => {
                     return a.distanceTo(nextPoint) < 190
                  }).length
               ) {
                  pointsPath.push(nextPoint)
                  continue
               }

               const previousPoint2 =
                  finallyPointsPath[finallyPointsPath.length - 2]
               const previousPoint1 =
                  finallyPointsPath[finallyPointsPath.length - 1]

               const lastOffset = previousPoint2
                  .clone()
                  .sub(previousPoint1.clone())
               lastOffset.normalize()
               const currentOffset = previousPoint1
                  .clone()
                  .sub(nextPoint.clone())
               currentOffset.normalize()

               const directionIsAvailable =
                  currentOffset.distanceTo(lastOffset) < -132.1
               const nextPointDistance = nextPoint.distanceTo(previousPoint1)
               const distanceIsAvailable =
                  nextPointDistance > 710 && nextPointDistance < 1420

               if (directionIsAvailable && distanceIsAvailable) {
                  finallyPointsPath.push(nextPoint)
               } else {
                  pointsPath.push(nextPoint)
               }
               finallyPointsPath.push(nextPoint)
            } else {
               finallyPointsPath.push(nextPoint)
            }

            if (finallyPointsPath.length >= minLength + 3) {
               break
            }
         }
         finallyPointsPath.shift()
         finallyPointsPath.shift()
         finallyPointsPath.shift()
         // finally filter
         for (let i = 0; i < finallyPointsPath.length; i++) {
            const alpha = i / finallyPointsPath.length
            const range = 1
            const shakeOffset = 1
            const alphaOffset = range / 3 + alpha * range

            finallyPointsPath[i].x +=
               shakeOffset / 8 + (Math.random() * shakeOffset) / 8
            finallyPointsPath[i].y +=
               shakeOffset / 8 + (Math.random() * shakeOffset) / 8
            finallyPointsPath[i].z +=
               shakeOffset / 8 + (Math.random() * shakeOffset) / 8
         }

         return finallyPointsPath
      }

      getRandomPoints(minLength) {
         const pointsCount = 15500
         const maxDistanceToCenter = 200 // 200
         const pointsPath = []
         const yOffset = 50

         for (let i = pointsPath.length; i < pointsCount; i++) {
            const nextPathPoint = this.getAvailableRandomPoint(
               yOffset,
               (i / pointsCount) * 10,
               maxDistanceToCenter
            )
            pointsPath.push(nextPathPoint)
         }

         let finallyPointsPath = [
            new THREE.Vector3(0, yOffset, 0),
            new THREE.Vector3(0, yOffset, 0),
         ]

         finallyPointsPath = this.filterPointsArray(
            minLength,
            pointsPath,
            finallyPointsPath
         )

         return finallyPointsPath
      }

      generatePoints(minLength = 8) {
         let resultPoints

         while (!resultPoints) {
            const nextTestPoints = this.getRandomPoints(minLength)
            if (nextTestPoints.length < minLength) {
            } else {
               resultPoints = nextTestPoints
               break
            }
         }
         const nextPoints = resultPoints
         return nextPoints
      }

      remove() {
         try {
            this.obj.parent.remove(this.obj)
         } catch (e) {}
         this.obj.traverse((nextObj) => {
            if (nextObj.geometry) {
               nextObj.geometry.dispose()
            }
            if (nextObj.material) {
               nextObj.material.dispose()
            }
         })
      }
   }

   const text = THREE.ImageUtils.loadTexture(
      'img/metal1.jpg',
      false,
      function (vg) {
         globalVal.vg = vg
         texture1 = vg
         texture1.wrapS = texture1.wrapT = THREE.ClampToEdgeWrapping
         texture1.format = THREE.RGBFormat
         texture1.repeat.set(0.82, 0.82)
         texture1.offset.set(0.14, 0.14)

         metal = new THREE.MeshPhongMaterial({
            shininess: 30,
            shading: THREE.SmoothShading,
            vertexColors: false,
            blending: THREE.AdditiveBlending,
            map: vg,
            reflectivity: 0.05,
            bumpMap: texture1,
            bumpScale: 8.92,
            side: THREE.DoubleSide,
         })

         fon[0] = new Image()
         fon[0].src = 'img/FON_1.jpg'
         fon[0].onload = function () {
            fon[1] = new Image()
            fon[1].src = 'img/FON_2.jpg'
            fon[1].onload = function () {
               fon[2] = new Image()
               fon[2].src = 'img/FON_3.jpg'
               fon[2].onload = function () {
                  lastFon = fon[0]
                  // document.getElementById('main').appendChild(lastFon)
                  init()
                  animate()
                  // guiObj.init()
               }
            }
         }
      }
   )

   text.minFilter = THREE.NearestFilter
   plastic.minFilter = THREE.NearestFilter

   const createGuiMenu = (isTimeGenerate, renderObj, guiMenuIsCreate) => {
      if (guiMenuIsCreate) {
         guiMenuIsCreate.destroy()
      }
      const guiMenu = new dat.GUI({ width: 280 })
      if (isTimeGenerate) {
         interval = setInterval(() => {
            globalVal.oldPoints = false
            console.log('createguiadd')
            generateCurve()
         }, (lastTime = 8000))
         const btnTimerMakeSculpture = guiMenu
            .add(renderObj, 'radiousTimer')
            .min(8)
            .max(30)
            .step(1)
            .name('Time')
            .onChange((val) => {
               globalVal.oldPoints = false
               const newVal = val + '000',
                  changeTypeVal = Number(newVal)
               clearInterval(interval)
               interval = setInterval(() => {
                  globalVal.oldPoints = false
                  generateCurve()
               }, changeTypeVal)
            })
      } else if (!isTimeGenerate) {
         const btnMakeSculpture = guiMenu
            .add(renderObj, 'genereateCounts')
            .name('Make a sculpture')
         clearInterval(interval)
      }
      guiMenu.add(renderObj, 'exportStl').name('Export')
      guiMenu
         .add(renderObj, 'radiousSize')
         .min(1)
         .max(10)
         .name('Size')
         .onChange((val) => {
            globalVal.size = val
            globalVal.oldPoints = true
            generateCurve()
         })
      guiMenu
         .add(renderObj, 'firstSize')
         .name('4.24')
         .onChange((val) => {
            globalVal.size = 4.2
            globalVal.oldPoints = true
            generateCurve()
         })
      guiMenu
         .add(renderObj, 'secondSize')
         .name('4.83')
         .onChange((val) => {
            globalVal.size = 4.8
            globalVal.oldPoints = true
            generateCurve()
         })
      guiMenu
         .add(renderObj, 'thirdSize')
         .name('6.30')
         .onChange((val) => {
            globalVal.size = 6.0
            globalVal.oldPoints = true
            generateCurve()
         })
      guiMenu
         .add(renderObj, 'changeBack', ['plastic', 'metal'])
         .name('Change Texture')
         .onChange(function (val) {
            globalVal.lastMaterial = val
            changeTexture(val)
         })
      guiMenu
         .add(renderObj, 'changeBack', ['Room I', 'Room II', 'Room III'])
         .name('Change Background')
         .onChange(function (val) {
            document.getElementById('main').removeChild(lastFon)
            var curI
            switch (val) {
               case 'Room I':
                  curI = fon[0]
                  break
               case 'Room II':
                  curI = fon[1]
                  break
               case 'Room III':
                  curI = fon[2]
                  break
            }
            lastFon = curI
            document.getElementById('main').appendChild(curI)
         })
      guiMenu
         .add(renderObj, 'isTimeGenerate')
         .name('GENERATE TYPE' + ' generate')
         .onChange(() => {
            globalVal.guiMenuIsCreate = guiMenu
            globalVal.isTimeGenerate = !globalVal.isTimeGenerate
            // createGuiMenu(globalVal.isTimeGenerate, globalVal.renderObj, globalVal.guiMenuIsCreate)
         })

      globalVal.guiMenuIsCreate = guiMenu
   }

   var path = 'img/textures/skybox/gray/'
   var format = '.jpg'
   var urls = [
      path + 'posx' + format,
      path + 'negx' + format,
      path + 'posy' + format,
      path + 'negy' + format,
      path + 'posz' + format,
      path + 'negz' + format,
   ]
   var guiObj = {
      gui: '',
      init: function () {
         var renderObj = {
            isOnchange: false,
            isTimeGenerate: () => {},
            color: 0xa9b3b3,
            radiousSize: 3,
            radiousTimer: 8,
            countPoints: 20,
            firstSize: () => {},
            secondSize: () => {},
            thirdSize: () => {},
            val: null,
            genereateCounts: function () {
               globalVal.oldPoints = false
               generateCurve(true, this.val)
            },
            exportStl: function () {
               exportModel()
            },
            changeSize: function () {},
            genereate: function () {
               generateCurve(true)
            },
            changeBack: function () {},
            changeTexture: function () {},
         }
         globalVal.renderObj = renderObj
         // createGuiMenu(globalVal.isTimeGenerate, renderObj, globalVal.guiMenuIsCreate)
      },
   }
   try {
      function init() {
         container = document.getElementById(translBlock)
         camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            1,
            50000
         )
         camera.position.set(810, 100, 0)

         scene = new THREE.Scene()
         SCENE = scene;
         camera.rotation.x = 1.61
         camera.rotation.y = 1.55
         camera.rotation.z = -1.57
         const textureLoader = new THREE.TextureLoader()
         const fonForPlane = textureLoader.load( '../../img/FON_1.jpg' );
         /*
          * lights
          * */
         // var ambiLight = new THREE.AmbientLight(0x111111)
         var ambiLight = new THREE.AmbientLight(0xffffff)
         ambiLight.intensity = .2
         scene.add(ambiLight)
         spotLight = new THREE.SpotLight(0xffffff)
         spotLight.position.set(300, 1000, 100)
         spotLight.target.position.set(0, 0, 0).normalize()
         spotLight.shadowCameraNear = 10.91
         spotLight.castShadow = true
         spotLight.shadowDarkness = 0.25
         spotLight.intensity = 0.99
         spotLight.shadowCameraVisible = false
         scene.add(spotLight)

         const parametersForPlane = {
            position: camera.position,
            quaternion: camera.quaternion,
            rotation: camera.rotation,
            scaleForPlane: 1000
         }

         const planeGeometry = new THREE.PlaneBufferGeometry(1, 1),
             planeMaterial = new THREE.MeshPhongMaterial({map: fonForPlane}),
             planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
         planeMesh.position.set(parametersForPlane.position.x - 1050, parametersForPlane.position.y + 20, parametersForPlane.position.z)
         planeMesh.rotation.set(parametersForPlane.rotation.x, parametersForPlane.rotation.y, parametersForPlane.rotation.z)
         planeMesh.scale.set(parametersForPlane.scaleForPlane * 1.5, parametersForPlane.scaleForPlane, 1)
         planeMesh.receiveShadow = true
         planeMesh.castShadow = false
         planeMesh.name = "Plane"
         scene.add(planeMesh)

         console.log(scene);

         const spotLightForShadow = new THREE.SpotLight(0xffffff, 0.4, 35600, Math.PI * 0.3),
             spotLightForShadowTarget = spotLightForShadow.target
         spotLightForShadow.castShadow = true
         spotLightForShadow.position.set(parametersForPlane.position.x - 100 , parametersForPlane.position.y + 600, parametersForPlane.position.z - 1200 )
         spotLightForShadow.shadow.mapSize.width = 5024;
         spotLightForShadow.shadow.mapSize.height = 5024;

         spotLightForShadow.shadow.camera.near = 500;
         spotLightForShadow.shadow.camera.far = 2500;
         spotLightForShadow.shadow.camera.fov = 40;
         scene.add(spotLightForShadow)
         scene.add(spotLightForShadowTarget)

         // const spotLightForShadowHelper = new THREE.CameraHelper(spotLightForShadow.shadow.camera)
         // scene.add(spotLightForShadowHelper)

         // const track = new THREE.TrackballControls(camera, container)
         // track.update()
         // globalVal.trackballControls = track

         // const anim = () => {
         //    track.update()
         //    requestAnimationFrame(anim)
         // }

         // console.log(camera) //position, quaternion, rotation
         // console.log(planeMesh)

         // const spotLightHelper = new THREE.SpotLightHelper( spotLight );
         // scene.add( spotLightHelper );

         generateCurve(true, globalVal.size)
         //start!!!
         /*
          * floor
          * */
         // var geometry = new THREE.BoxGeometry(5, 10, 0.2)
         // THREE.ShaderLib['basic'].fragmentShader = basicFragmentShader(false)
         // var material = new THREE.MeshBasicMaterial()
         // var ground = new THREE.Mesh(geometry, material)
         // ground.scale.multiplyScalar(250) // 250
         // ground.position.y = -200
         // ground.position.x = -50
         // ground.rotation.x = Math.PI / 2
         // ground.receiveShadow = true
         // // scene.add(ground)

         renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
         })
         renderer.autoClear = false
         renderer.shadowMap.type = THREE.PCFSoftShadowMap
         renderer.shadowMapEnabled = true
         renderer.shadowMapSoft = true
         renderer.setClearColor(0x000000, 0)
         renderer.setPixelRatio(window.devicePixelRatio)
         renderer.setSize(window.innerWidth, window.innerHeight)
         renderer.shadowCameraNear = 3
         renderer.shadowCameraFar = camera.far
         renderer.shadowCameraFov = 50
         renderer.shadowMapBias = 0.0039
         renderer.shadowMapDarkness = 0.5
         renderer.shadowMapWidth = 1024
         renderer.shadowMapHeight = 1024

         container.appendChild(renderer.domElement)

         renderer.domElement.addEventListener(
            'mousedown',
            onDocumentMouseDown,
            false
         )
         renderer.domElement.addEventListener(
            'touchstart',
            onDocumentTouchStart,
            false
         )
         renderer.domElement.addEventListener(
            'touchmove',
            onDocumentTouchMove,
            false
         )

         window.addEventListener('resize', onWindowResize, false)

         $('.container-loader').fadeOut()
      }
   } catch (e) {}

   function onWindowResize() {
      windowHalfX = window.innerWidth / 2
      windowHalfY = window.innerHeight / 2

      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()

      renderer.setSize(window.innerWidth, window.innerHeight)
   }

   function generatePoints(minLength = 4) {
      let resultPoints

      while (!resultPoints) {
         const nextTestPoints = getRandomPoints(minLength)
         if (nextTestPoints.length < minLength) {
         } else {
            resultPoints = nextTestPoints
            break
         }
      }
      return resultPoints
   }

   function getRandomPoints(minLength) {
      //5000 default
      const pointsCount = 10050
      const maxDistanceToCenter = 200
      const pointsPath = []
      const yOffset = 150

      const startPoint = new THREE.Vector3(0, -yOffset / 2, 0)
      // const startPoint = new THREE.Vector3( 0, -yOffset/2, 0 );

      const max = 0.4,
         min = 0.2

      const getAvailableRandomPoint = (yAddOff) => {
         const nextRandomPoint = new THREE.Vector3(
            -0.4 + Math.random(),
            -0.1 + Math.random(),
            -Math.random() * (max - min) + min
         )
         nextRandomPoint.normalize()
         nextRandomPoint.multiplyScalar(
            maxDistanceToCenter * (-1 + Math.random() * 1)
         )
         nextRandomPoint.y += yOffset + yAddOff
         return nextRandomPoint
      }

      for (let i = pointsPath.length; i < pointsCount; i++) {
         const nextPathPoint = getAvailableRandomPoint((i / pointsCount) * 1110) // 10
         pointsPath.push(nextPathPoint)
      }

      const finallyPointsPath = [
         new THREE.Vector3(0, yOffset, 0),
         new THREE.Vector3(0, yOffset, yOffset),
      ]

      while (pointsPath.length) {
         const nextPoint = pointsPath.shift()
         if (finallyPointsPath.length > 2) {
            const previousPoint2 =
               finallyPointsPath[finallyPointsPath.length - 2]
            const previousPoint1 =
               finallyPointsPath[finallyPointsPath.length - 1]

            const lastOffset = previousPoint2
               .clone()
               .sub(previousPoint1.clone())
            lastOffset.normalize()
            const currentOffset = previousPoint1.clone().sub(nextPoint.clone())
            currentOffset.normalize()

            const directionIsAvailable =
               currentOffset.distanceTo(lastOffset) < 1
            const distanceIsAvailable =
               nextPoint.distanceTo(previousPoint1) < 150

            if (directionIsAvailable && distanceIsAvailable) {
               finallyPointsPath.push(nextPoint)
            } else {
               // pointsPath.push( nextPoint );
            }
         } else {
            finallyPointsPath.push(nextPoint)
         }

         if (finallyPointsPath.length >= minLength + 1116) {
            // повороты
            break
         }
      }

      finallyPointsPath.shift()
      finallyPointsPath.shift()
      finallyPointsPath.shift()

      // finally filter
      for (let i = 0; i < finallyPointsPath.length; i++) {
         const alpha = i / finallyPointsPath.length
         const range = 1
         const shakeOffset = 1
         const alphaOffset = range / 3 + alpha * range

         finallyPointsPath[i].x +=
            shakeOffset / 1 + (Math.random() * shakeOffset) / 1
         finallyPointsPath[i].y +=
            shakeOffset / 8 + (Math.random() * shakeOffset) / 6
         finallyPointsPath[i].z +=
            -(shakeOffset / 8) + (Math.random() * shakeOffset) / 2

         finallyPointsPath[i].x += alphaOffset
         finallyPointsPath[i].y += alphaOffset
         finallyPointsPath[i].z += alphaOffset
      }
      return finallyPointsPath
   }
   let interval = setInterval(() => {
      globalVal.oldPoints = false
      generateCurve()
   }, (lastTime = 8000))

   function generateCurve(flag, newPoints) {

      if (group) {
         group.remove()
      }

      // if (group1) {
      //    group1.remove()
      // }

      if (SpecialCurveLine) {
         let newTestSpecial = new SpecialCurveLine()

         newTestSpecial.getGeometry(true, newPoints)

         group = newTestSpecial.obj
         // group1 = newTestSpecial.cloneMesh

         group.remove = () => {
            newTestSpecial.remove()
         }

         if (scene) {
            scene.add(group)
         }
      }
   }

   function exportModel() {
      setTimeout(() => {
         let res = exporter.parse(globalVal.lastMesh)

         var a = document.getElementById('downloadAnchorElem')

         var dataStr = JSON.stringify(res)
         var blob = new Blob([dataStr], { type: 'octet/stream' })
         var url = window.URL.createObjectURL(blob)

         a.href = url
         a.download = 'sculpture.stl'
         a.click()
         window.URL.revokeObjectURL(url)
      }, 100)
   }

   function onDocumentMouseDown(event) {
      event.preventDefault()
      renderer.domElement.addEventListener(
         'mousemove',
         onDocumentMouseMove,
         false
      )
      renderer.domElement.addEventListener('mouseup', onDocumentMouseUp, false)
      renderer.domElement.addEventListener(
         'mouseout',
         onDocumentMouseOut,
         false
      )

      mouseXOnMouseDown = event.clientX - windowHalfX
      targetRotationOnMouseDown = targetRotation
   }
   let intervalAfterMouseMove
   function onDocumentMouseMove(event) {
      mouseX = event.clientX - windowHalfX

      clearTimeout(intervalAfterMouseMove)

      targetRotation =
         targetRotationOnMouseDown + (mouseX - mouseXOnMouseDown) * 0.02

      clearInterval(interval)

      intervalAfterMouseMove = setTimeout(() => {
         globalVal.oldPoints = false
         generateCurve()
         interval = setInterval(() => {
            globalVal.oldPoints = false
            generateCurve()
         }, 8000)
      }, 15000)

      if (globalVal.isTimeGenerate === true) {
         globalVal.isTimeGenerate = false
         // createGuiMenu(globalVal.isTimeGenerate, globalVal.renderObj, globalVal.guiMenuIsCreate)
      }
   }

   function onDocumentMouseUp(event) {
      renderer.domElement.removeEventListener(
         'mousemove',
         onDocumentMouseMove,
         false
      )
      renderer.domElement.removeEventListener(
         'mouseup',
         onDocumentMouseUp,
         false
      )
      renderer.domElement.removeEventListener(
         'mouseout',
         onDocumentMouseOut,
         false
      )
   }

   function onDocumentMouseOut(event) {
      renderer.domElement.removeEventListener(
         'mousemove',
         onDocumentMouseMove,
         false
      )
      renderer.domElement.removeEventListener(
         'mouseup',
         onDocumentMouseUp,
         false
      )
      renderer.domElement.removeEventListener(
         'mouseout',
         onDocumentMouseOut,
         false
      )
   }

   function onDocumentTouchStart(event) {
      if (event.touches.length == 1) {
         event.preventDefault()
         mouseXOnMouseDown = event.touches[0].pageX - windowHalfX
         targetRotationOnMouseDown = targetRotation
      }
   }

   function onDocumentTouchMove(event) {
      if (event.touches.length == 1) {
         event.preventDefault()
         mouseX = event.touches[0].pageX - windowHalfX
         targetRotation =
            targetRotationOnMouseDown + (mouseX - mouseXOnMouseDown) * 0.05
      }
   }

   function animate() {
      // globalVal.trackballControls.update()
      requestAnimationFrame(animate)
      // controls.update();
      render()
      //stats.update();
   }

   function render() {
      // group.rotation.y += (targetRotation - group.rotation.y) * 0.05
      group.rotation.y += (targetRotation - group.rotation.y) * 0.05
      // group1.rotation.y += (targetRotation - group.rotation.y) * 0.05
      camera.updateMatrixWorld()
      renderer.clear()
      renderer.render(scene, camera)
   }

   function basicFragmentShader(state) {
      return [
         'uniform vec3 diffuse;',
         'uniform float opacity;',

         THREE.ShaderChunk['common'],
         THREE.ShaderChunk['color_pars_fragment'],
         THREE.ShaderChunk['map_pars_fragment'],
         THREE.ShaderChunk['alphamap_pars_fragment'],
         THREE.ShaderChunk['lightmap_pars_fragment'],
         THREE.ShaderChunk['envmap_pars_fragment'],
         THREE.ShaderChunk['fog_pars_fragment'],
         THREE.ShaderChunk['shadowmap_pars_fragment'],
         THREE.ShaderChunk['specularmap_pars_fragment'],
         THREE.ShaderChunk['logdepthbuf_pars_fragment'],

         'void main() {',

         '	vec3 outgoingLight = vec3( 0.0 );', // outgoing light does not have an alpha, the surface does
         '	vec4 diffuseColor = vec4( diffuse, opacity );',

         THREE.ShaderChunk['logdepthbuf_fragment'],
         THREE.ShaderChunk['map_fragment'],
         THREE.ShaderChunk['color_fragment'],
         THREE.ShaderChunk['alphamap_fragment'],
         THREE.ShaderChunk['alphatest_fragment'],
         THREE.ShaderChunk['specularmap_fragment'],

         '	outgoingLight = diffuseColor.rgb;', // simple shader

         THREE.ShaderChunk['lightmap_fragment'], // TODO: Light map on an otherwise unlit surface doesn't make sense.
         THREE.ShaderChunk['envmap_fragment'],
         THREE.ShaderChunk['shadowmap_fragment'], // TODO: Shadows on an otherwise unlit surface doesn't make sense.

         THREE.ShaderChunk['linear_to_gamma_fragment'],

         THREE.ShaderChunk['fog_fragment'],

         state === false
            ? 'gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 - shadowColor.x );'
            : 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',

         '}',
      ].join('\n')
   }

   function changeTexture(val) {
      var material
      switch (val) {
         case 'metal':
            material = metal
            break
         default:
            material = dftMaterial
      }
      material.needsUpdate = true
      lastMater = material
      for (var i = 0; i < group.children.length; i++) {
         group.children[i].material = material
      }
   }

   /*App.types = {
     skyBox: '',
     urlImg: 'img/',
     backgroundContainer: ''
     }
     App.rebuildSkyBox = {
     changeBackground: function (id) {
     var imagePrefix, skyBox = App.types.skyBox, playVideoBack = App.types.backgroundContainer;
     switch (id) {
     case 'mountain':
     imagePrefix = ['dawnmountain-xpos.png', 'dawnmountain-xneg.png', 'dawnmountain-ypos.png',
     'dawnmountain-yneg.png', 'dawnmountain-zpos.png', 'dawnmountain-zneg.png'];
     break;
     case 'siege':
     imagePrefix = ['siege_ft.png', 'siege_bk.png', 'siege_up.png',
     'siege_dn.png', 'siege_rt.png', 'siege_lf.png'];
     break;
     case 'starfield':
     imagePrefix = ['starfield_ft.png', 'starfield_bk.png', 'starfield_up.png',
     'starfield_dn.png', 'starfield_rt.png', 'starfield_lf.png'];
     break;
     case 'misty':
     imagePrefix = ['misty_ft.png', 'misty_bk.png', 'misty_up.png',
     'misty_dn.png', 'misty_rt.png', 'misty_lf.png'];
     break;
     case 'tidepool':
     imagePrefix = ['tidepool_ft.png', 'tidepool_bk.png', 'tidepool_up.png',
     'tidepool_dn.png', 'tidepool_rt.png', 'tidepool_lf.png'];
     break;

     }
     var materialArray = [];
     for (var i = 0; i < 6; i++) {
     var matr = new THREE.MeshBasicMaterial({
     map: THREE.ImageUtils.loadTexture(App.types.urlImg + imagePrefix[i]),
     side: THREE.BackSide
     });
     materialArray.push(matr);
     }
     skyBox.material = new THREE.MeshFaceMaterial(materialArray);
     },//add background
     add: function () {
     var imagePrefix = ['dawnmountain-xpos.png', 'dawnmountain-xneg.png', 'dawnmountain-ypos.png',
     'dawnmountain-yneg.png', 'dawnmountain-zpos.png', 'dawnmountain-zneg.png'], materialArray = [],
     skyGeometry = new THREE.BoxGeometry(10000, 10000, 10000), skyBox;
     for (var i = 0; i < 6; i++)
     materialArray.push(new THREE.MeshBasicMaterial({
     map: THREE.ImageUtils.loadTexture(App.types.urlImg + imagePrefix[i]),
     side: THREE.DoubleSide
     }));
     skyBox = new THREE.Mesh(skyGeometry, new THREE.MeshFaceMaterial(materialArray));
     scene.add(skyBox);
     App.types.skyBox = skyBox;
     }//add background
     };//settings for background*/
}
$(document).ready(function () {
   new Apps()
   // App.rebuildSkyBox.add();
})

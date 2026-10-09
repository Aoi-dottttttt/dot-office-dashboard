import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.js';
import {buildOffice,setCamera,setTheme,setWorking,stepStation,setStationModel,disposeOffice} from '../public/office-model.js';

test('decor stays inside each room shape, under the camera frame, and clear of every workstation',()=>{
  const office=buildOffice();
  for(const [width,height] of [[390,1040],[1000,800],[1440,860]]){
    setCamera(office,width,height);office.scene.updateMatrixWorld(true);const size=office.roomSize;
    const seats=[...office.stations.values()].map(station=>new T.Box3().setFromObject(station.group));
    assert.ok(office.decor.group.children.length>=3,`${office.layout}: room is furnished`);
    for(const cluster of office.decor.group.children){
      const box=new T.Box3().setFromObject(cluster);
      assert.ok(box.min.x>=-size.width/2&&box.max.x<=size.width/2&&box.min.z>=-size.depth/2&&box.max.z<=size.depth/2,`${cluster.name} leaves the ${office.layout} room`);
      assert.ok(box.max.y<size.wallHeight,`${cluster.name} rises above the walls`);
      seats.forEach((seat,index)=>assert.equal(box.intersectsBox(seat),false,`${cluster.name} overlaps seat ${index+1} in the ${office.layout} room`));
    }
  }
  setCamera(office,390,1040);assert.equal(office.decor.group.getObjectByName('decor-lounge'),undefined,'Clusters without room leave the scene graph');
  setCamera(office,1440,860);assert.ok(office.decor.group.getObjectByName('decor-lounge'));
  disposeOffice(office);
});

test('night theme lights the lamps; seat accents follow the chosen character',()=>{
  const office=buildOffice(),station=office.stations.get(1);
  assert.equal(office.palette.glow.emissiveIntensity,0);assert.equal(office.decor.lampLight.intensity,0);
  setTheme(office,true);assert.ok(office.palette.glow.emissiveIntensity>1);assert.ok(office.decor.lampLight.intensity>0);
  setTheme(office,false);assert.ok(station.mugMat.color.equals(new T.Color(globalThis.SeatSettings.model('cloud-headset').color)));
  setStationModel(office,1,'rose-heart');assert.ok(station.mugMat.color.equals(new T.Color(globalThis.SeatSettings.model('rose-heart').color)));assert.ok(station.rugMat.color.r>station.rugMat.color.b);
  disposeOffice(office);
});

test('screens scroll code only while typing is animated',()=>{
  const office=buildOffice(),station=office.stations.get(2);setWorking(station,true,{instant:true});
  const start=station.screenMap.offset.y;stepStation(station,5.7,.03,false);assert.equal(station.screenMap.offset.y,start);
  stepStation(station,5.7,.03,true);assert.notEqual(station.screenMap.offset.y,start);
  setWorking(station,false,{instant:true});const paused=station.screenMap.offset.y;stepStation(station,9,.03,true);assert.equal(station.screenMap.offset.y,paused);
  disposeOffice(office);
});

test('the window is an open frame: the back wall opens behind the glass in every layout',()=>{
  const office=buildOffice(),wall=office.room.getObjectByName('back-wall'),hitsWall=(x,y)=>new T.Raycaster(new T.Vector3(x,y,40),new T.Vector3(0,0,-1)).intersectObject(wall).length>0;
  for(const [width,height] of [[390,1040],[1000,800],[1440,860]]){
    setCamera(office,width,height);office.scene.updateMatrixWorld(true);
    const glass=office.decor.glass,center=glass.getWorldPosition(new T.Vector3());
    assert.equal(hitsWall(center.x,center.y),false,`${office.layout}: the view passes through the window`);
    assert.equal(hitsWall(center.x,1),true,'The wall below the sill stays solid');
    assert.ok(glass.material.transparent&&glass.material.opacity<.3&&!glass.material.map,'Clear glass, no outdoor picture');
  }
  office.yaw=Math.PI;setCamera(office,1440,860);office.scene.updateMatrixWorld(true);assert.equal(wall.geometry,office.walls.solidBack,'A cut-away stub has no opening');
  office.yaw=.14;setCamera(office,1440,860);assert.equal(wall.geometry,office.walls.openBack);
  disposeOffice(office);
});

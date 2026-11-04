#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileCinematicScreenCamera} from "../apps/studio-next/src/lib/a1-cinematic-screen-camera-v1.mjs";
const fixtures=[
  {genre:"EDITORIAL_DOCUMENT",mode:"CINEMATIC_DOLLY_PUSH",primaryRegion:{x:.18,y:.43,width:.56,height:.12}},
  {genre:"PRODUCT_DASHBOARD",mode:"WHIP_REFRAME",primaryRegion:{x:.08,y:.18,width:.26,height:.22},secondaryRegion:{x:.66,y:.58,width:.27,height:.2}},
  {genre:"PRESENTATION_SLIDE",mode:"OBLIQUE_2_5D"},
];
const results=fixtures.map((fixture)=>compileCinematicScreenCamera({...fixture,durationMs:4200,fps:60}));for(const result of results){assert.equal(result.status,"PASS",JSON.stringify(result.failures));assert.equal(result.motionBlurPolicy,"TEMPORAL_CAMERA_ONLY");assert.ok(result.diagnostics.activeBlurFrames>=10);assert.ok(result.cameraPerformance.finalSharpHoldFrames>=120);assert.equal(result.diagnostics.settledVelocity,0);assert.equal(result.policy.highDpiSourceRequired,true);}
const dolly=results[0],whip=results[1],oblique=results[2];assert.equal(dolly.cameraPerformance.maximumScale,2.2);assert.equal(dolly.cameraPerformance.moveWindow.durationFrames,18);assert.equal(whip.cameraPerformance.moveWindow.durationFrames,12);assert.ok(whip.diagnostics.peakVelocity>dolly.diagnostics.peakVelocity);assert.equal(oblique.cameraPerformance.maximumRotateY,19);assert.equal(oblique.cameraPerformance.maximumRotateX,7);assert.ok(oblique.samples.some((sample)=>sample.camera.rotateY<-15));assert.equal(compileCinematicScreenCamera({mode:"CINEMATIC_DOLLY_PUSH",durationMs:4200}).status,"FAIL");
console.log(JSON.stringify({status:"PASS",contract:"A1CinematicScreenCameraTest/v1",fixtures:results.map((result,index)=>({genre:fixtures[index].genre,mode:result.mode,maximumScale:result.cameraPerformance.maximumScale,activeBlurFrames:result.diagnostics.activeBlurFrames,peakVelocity:result.diagnostics.peakVelocity,directionSha256:result.directionSha256}))},null,2));

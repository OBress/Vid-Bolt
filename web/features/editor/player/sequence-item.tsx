import React from "react";
import {
  IAudio,
  ICaption,
  IHillAudioBars,
  IIllustration,
  IImage,
  ITrackItem,
  ILinealAudioBars,
  IProgressBar,
  IProgressFrame,
  IRadialAudioBars,
  IShape,
  IText,
  IVideo,
  IWaveAudioBars,
} from "@designcombo/types";
import {
  Audio,
  Caption,
  HillAudioBars,
  Illustration,
  Image,
  LinealAudioBars,
  ProgressBar,
  ProgressFrame,
  RadialAudioBars,
  Shape,
  Text,
  Video,
  WaveAudioBars,
} from "./items";
import { SequenceItemOptions } from "./base-sequence";

export const SequenceItem: Record<
  string,
  (item: ITrackItem, options: SequenceItemOptions) => React.JSX.Element
> = {
  text: (item, options) => (
    <Text key={item.id} item={item as IText} options={options} />
  ),
  caption: (item, options) => (
    <Caption key={item.id} item={item as ICaption} options={options} />
  ),
  shape: (item, options) => (
    <Shape key={item.id} item={item as IShape} options={options} />
  ),
  video: (item, options) => (
    <Video key={item.id} item={item as IVideo} options={options} />
  ),
  audio: (item, options) => (
    <Audio key={item.id} item={item as IAudio} options={options} />
  ),
  image: (item, options) => (
    <Image key={item.id} item={item as IImage} options={options} />
  ),
  illustration: (item, options) => (
    <Illustration
      key={item.id}
      item={item as IIllustration}
      options={options}
    />
  ),
  progressBar: (item, options) => (
    <ProgressBar key={item.id} item={item as IProgressBar} options={options} />
  ),
  linealAudioBars: (item, options) => (
    <LinealAudioBars
      key={item.id}
      item={item as ILinealAudioBars}
      options={options}
    />
  ),
  waveAudioBars: (item, options) => (
    <WaveAudioBars
      key={item.id}
      item={item as IWaveAudioBars}
      options={options}
    />
  ),
  hillAudioBars: (item, options) => (
    <HillAudioBars
      key={item.id}
      item={item as IHillAudioBars}
      options={options}
    />
  ),
  progressFrame: (item, options) => (
    <ProgressFrame
      key={item.id}
      item={item as IProgressFrame}
      options={options}
    />
  ),
  radialAudioBars: (item, options) => (
    <RadialAudioBars
      key={item.id}
      item={item as IRadialAudioBars}
      options={options}
    />
  ),
};

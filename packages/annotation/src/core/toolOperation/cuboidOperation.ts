import CommonToolUtils from '@/utils/tool/CommonToolUtils';
import { BasicToolOperation, IBasicToolOperationProps } from './basicToolOperation';
import DrawUtils from '../../utils/tool/DrawUtils';
import AxisUtils from '@/utils/tool/AxisUtils';
import uuid from '@/utils/uuid';
import {
  getPointsByBottomRightPoint,
  getCuboidDragMove,
  getCuboidHoverRange,
  getCuboidAllSideLine,
  getHighlightPoints,
} from '@/utils/tool/CuboidUtils';
import PolygonUtils from '@/utils/tool/PolygonUtils';
import { EDragStatus, EDragTarget } from '@/constant/annotation';
import { ICuboid, ICuboidPosition, IDrawingCuboid } from '@/types/tool/cuboid';

interface ICuboidOperationProps extends IBasicToolOperationProps {}

enum EDrawingStatus {
  Ready = 1,
  FirstPoint = 2,
  Cuboid = 3,
}

class CuboidOperation extends BasicToolOperation {
  public drawingCuboid?: IDrawingCuboid;

  // First Click
  public firstClickCoord?: ICoordinate;

  public drawingStatus = EDrawingStatus.Ready;

  public cuboidList: ICuboid[] = [];

  public selectedID = '';

  public hoverID = '';

  // Drag Data
  private dragInfo?: {
    dragStartCoord: ICoordinate; // Need to set under zoom in order to avoid inaccurate data due to precision conversion
    initCuboid: ICuboid;
    dragTarget: EDragTarget;
    positions?: ICuboidPosition[]; // Confirm the update Position.
  };

  // For effects when hover is highlighted.
  private highlightInfo?: Array<{
    type: string;
    points: ICoordinate[];
    originCuboid: ICuboid;
    positions: ICuboidPosition[];
  }>;

  public constructor(props: ICuboidOperationProps) {
    super(props);
    this.config = CommonToolUtils.jsonParser(props.config);
  }

  /**
   * 当前页面展示的框体
   */
  public get currentShowList() {
    let cuboidList: ICuboid[] = [];
    const [showingCuboid, selectedCuboid] = CommonToolUtils.getRenderResultList<ICuboid>(
      this.cuboidList,
      CommonToolUtils.getSourceID(this.basicResult),
      this.attributeLockList,
      this.selectedID,
    );
    cuboidList = showingCuboid;

    if (this.isHidden) {
      cuboidList = [];
    }

    if (selectedCuboid) {
      cuboidList.push(selectedCuboid);
    }
    return cuboidList;
  }

  public get selectedCuboid() {
    return this.cuboidList.find((v) => v.id === this.selectedID);
  }

  public getHoverID = (e: MouseEvent) => {
    const coordinate = this.getCoordinateUnderZoom(e);

    const { currentShowList } = this;

    if (currentShowList?.length > 0) {
      // 1. Get the cuboid max range(PointList)
      const polygonList = currentShowList.map((cuboid) => {
        return { id: cuboid.id, pointList: AxisUtils.changePointListByZoom(getCuboidHoverRange(cuboid), this.zoom) };
      });
      return PolygonUtils.getHoverPolygonID(coordinate, polygonList);
    }

    return '';
  };

  public updateSelectedCuboid(newCuboid: ICuboid) {
    this.cuboidList = this.cuboidList.map((cuboid) => {
      if (cuboid.id === this.selectedID) {
        return newCuboid;
      }
      return cuboid;
    });
  }

  public setResult() {}

  public onRightDblClick(e: MouseEvent) {
    super.onRightDblClick(e);

    const hoverRectID = this.getHoverID(e);
    if (this.selectedID && this.selectedID === hoverRectID) {
      this.deleteCuboid(hoverRectID);
    }
  }

  public setCuboidList(cuboidList: ICuboid[]) {
    const oldLen = this.cuboidList.length;
    this.cuboidList = cuboidList;

    if (oldLen !== cuboidList.length) {
      this.emit('updatePageNumber');
    }
  }

  public deleteCuboid(id: string) {
    if (!id) {
      return;
    }
    this.setCuboidList(this.cuboidList.filter((v) => v.id !== id));
    // TODO - History.

    this.selectedID = '';
    this.render();
  }

  public onMouseDown(e: MouseEvent) {
    if (super.onMouseDown(e) || this.forbidMouseOperation || e.ctrlKey === true) {
      return;
    }

    const { selectedCuboid } = this;

    if (!selectedCuboid || e.button === 2 || (e.button === 0 && this.isSpaceKey === true)) {
      return;
    }

    const hoverID = this.getHoverID(e);

    // Drag must be done only if the hoverID and selectedID are the same.
    if (hoverID !== this.selectedID) {
      return;
    }

    this.dragStatus = EDragStatus.Start;
    const dragStartCoord = this.getCoordinateUnderZoom(e);
    const DEFAULT_DRAG_INFO = {
      initCuboid: selectedCuboid,
      dragStartCoord,
    };

    const highlightInfo = AxisUtils.returnClosePointOrLineInCuboid(
      dragStartCoord,
      AxisUtils.changeCuboidByZoom(selectedCuboid, this.zoom) as ICuboid,
      {
        zoom: 1 / this.zoom,
        scope: 5,
      },
    );

    // Just use the first one.
    const firstHighlightInfo = highlightInfo?.[0];

    switch (firstHighlightInfo?.type) {
      case 'point':
        this.dragInfo = {
          ...DEFAULT_DRAG_INFO,
          dragTarget: EDragTarget.Point,
          positions: firstHighlightInfo.positions,
        };
        break;

      case 'line':
        this.dragInfo = {
          ...DEFAULT_DRAG_INFO,
          dragTarget: EDragTarget.Line,
          positions: firstHighlightInfo.positions,
        };
        break;

      default: {
        this.dragInfo = {
          ...DEFAULT_DRAG_INFO,
          dragTarget: EDragTarget.Cuboid,
        };
      }
    }
  }

  public onMouseUp(e: MouseEvent): boolean | void {
    if (super.onMouseUp(e) || this.forbidMouseOperation || !this.imgInfo) {
      return undefined;
    }

    if (this.dragInfo && this.dragStatus === EDragStatus.Move) {
      // 拖拽停止
      this.dragInfo = undefined;
      this.dragStatus = EDragStatus.Wait;
      // TODO History.
      // this.history.pushHistory(this.polygonList);

      // 同步 结果
      this.emit('updateResult');
      return;
    }

    const basicSourceID = CommonToolUtils.getSourceID(this.basicResult);

    if (e.button === 0) {
      // 1. Create First Point & Basic Cuboid.
      if (!this.drawingCuboid) {
        this.createNewDrawingCuboid(e, basicSourceID);
        return;
      }

      // 2. Finish Rect
      if (this.drawingCuboid) {
        switch (this.drawingStatus) {
          case EDrawingStatus.FirstPoint:
            this.closeNewDrawingFrontPlane();
            break;
          case EDrawingStatus.Cuboid:
            this.closeCuboid();
            break;

          default: {
            //
          }
        }
      }
    }

    // Right Click
    if (e.button === 2) {
      this.rightMouseUp(e);
    }
  }

  public onMouseMove(e: MouseEvent): boolean | void {
    if (super.onMouseMove(e) || this.forbidMouseOperation || !this.imgInfo) {
      return;
    }

    if (this.selectedID && this.dragInfo) {
      this.onDragMove(e);
      return;
    }

    if (this.drawingCuboid) {
      // 1. Drawing Front Plane.
      if (this.drawingFrontPlanesMove(e)) {
        return;
      }

      // 2. Drawing Back Plane.
      this.drawingBackPlaneMove(e);

      return;
    }

    this.hoverID = this.getHoverID(e);

    // Hover HightLight
    this.onHoverMove(e);
  }

  public drawingFrontPlanesMove(e: MouseEvent) {
    if (this.drawingCuboid && this.firstClickCoord && this.drawingStatus === EDrawingStatus.FirstPoint) {
      const coord = this.getCoordinateInOrigin(e);
      const { x, y } = this.firstClickCoord;
      const width = Math.abs(coord.x - x);
      const height = Math.abs(coord.y - y);

      this.drawingCuboid = {
        ...this.drawingCuboid,
        frontPoints: {
          tl: this.firstClickCoord,
          tr: {
            x: x + width,
            y,
          },
          bl: {
            x,
            y: y + height,
          },
          br: {
            x: x + width,
            y: y + height,
          },
        },
      };
      this.render();
      return true;
    }
  }

  public drawingBackPlaneMove(e: MouseEvent) {
    if (this.drawingCuboid && this.firstClickCoord && this.drawingStatus === EDrawingStatus.Cuboid) {
      const coord = this.getCoordinateInOrigin(e);

      // Forbidden to draw a cuboid if the backPlane is front than the frontPlane.
      // if (coord.y > this.drawingCuboid.y + this.drawingCuboid.height) {
      //   return;
      // }
      this.drawingCuboid = {
        ...this.drawingCuboid,
        backPoints: getPointsByBottomRightPoint({ coord, points: this.drawingCuboid.frontPoints }),
      };
      this.render();
    }
  }

  public onDragMove(e: MouseEvent) {
    if (!this.dragInfo || !this.selectedID) {
      return;
    }

    const { dragTarget, initCuboid, dragStartCoord, positions } = this.dragInfo;

    const coordinate = this.getCoordinateUnderZoom(e);

    const offset = {
      x: (coordinate.x - dragStartCoord.x) / this.zoom,
      y: (coordinate.y - dragStartCoord.y) / this.zoom,
    };

    this.dragStatus = EDragStatus.Move;

    const newCuboid = getCuboidDragMove({ offset, cuboid: initCuboid, dragTarget, positions });
    if (newCuboid) {
      this.updateSelectedCuboid(newCuboid);
    }
    this.render();
  }

  public onHoverMove(e: MouseEvent) {
    const { selectedCuboid } = this;
    if (selectedCuboid) {
      const currentCoord = this.getCoordinateUnderZoom(e);

      const highlightInfo = AxisUtils.returnClosePointOrLineInCuboid(
        currentCoord,
        AxisUtils.changeCuboidByZoom(selectedCuboid, this.zoom) as ICuboid, // The highlighted range needs to be under zoom to work properly
        {
          zoom: 1 / this.zoom,
          scope: 5,
        },
      );

      this.highlightInfo = highlightInfo;
      this.render();
    }
  }

  public createNewDrawingCuboid(e: MouseEvent, basicSourceID: string) {
    if (!this.imgInfo) {
      return;
    }
    // const coordinateZoom = this.getCoordinateUnderZoom(e);
    // const coordinate = AxisUtils.changeDrawOutsideTarget(
    //   coordinateZoom,
    //   { x: 0, y: 0 },
    //   this.imgInfo,
    //   this.config.drawOutsideTarget,
    //   this.basicResult,
    //   this.zoom,
    // );
    const coordinate = this.getCoordinateInOrigin(e);

    // 1. Create New Cuboid.
    this.drawingCuboid = {
      attribute: this.defaultAttribute,
      valid: !e.ctrlKey,
      id: uuid(8, 62),
      sourceID: basicSourceID,
      textAttribute: '',
      order: CommonToolUtils.getAllToolsMaxOrder(this.cuboidList, this.prevResultList) + 1,
      frontPoints: {
        tl: coordinate,
        bl: coordinate,
        tr: coordinate,
        br: coordinate,
      },
    };

    // 2. Save The First Click Coordinate.
    this.firstClickCoord = {
      ...coordinate,
    };

    // 3. Update Status.
    this.drawingStatus = EDrawingStatus.FirstPoint;
  }

  /**
   * Change Status
   * From drawing frontPlane to backPlane
   */
  public closeNewDrawingFrontPlane() {
    this.drawingStatus = EDrawingStatus.Cuboid;
  }

  public closeCuboid() {
    this.cuboidList.push(this.drawingCuboid as ICuboid);
    this.selectedID = this.drawingCuboid?.id ?? '';
    this.drawingCuboid = undefined;
    this.drawingStatus = EDrawingStatus.Ready;
    this.render();
  }

  public rightMouseUp(e: MouseEvent) {
    // 1. Selected
    const hoverID = this.getHoverID(e);
    if (hoverID) {
      this.selectedID = hoverID;
    }
    this.render();
  }

  public renderSingleCuboid(cuboid: ICuboid | IDrawingCuboid) {
    const transformCuboid = AxisUtils.changeCuboidByZoom(cuboid, this.zoom, this.currentPos);
    const toolColor = this.getColor(transformCuboid.attribute);
    const strokeColor = toolColor.valid.stroke;
    const lineWidth = this.style?.width ?? 2;
    const { hiddenText = false } = this.style;
    const defaultStyle = {
      color: strokeColor,
      thickness: lineWidth,
    };
    const { backPoints } = transformCuboid;
    if (backPoints) {
      const sideLine = getCuboidAllSideLine(transformCuboid as ICuboid);
      sideLine?.forEach((line) => {
        DrawUtils.drawLine(this.canvas, line.p1, line.p2, { ...defaultStyle });
      });

      // DrawUtils.drawRect(this.canvas, backRect, { ...defaultStyle });
      const backPointList = AxisUtils.transformPlain2PointList(backPoints);

      DrawUtils.drawPolygon(this.canvas, backPointList, { ...defaultStyle, isClose: true });

      // Hover Highlight
      if (transformCuboid.id === this.hoverID || transformCuboid.id === this.selectedID) {
        const hoverPointList = getHighlightPoints(transformCuboid as ICuboid);
        hoverPointList.forEach((data) => {
          DrawUtils.drawCircleWithFill(this.canvas, data.point, 5, { ...defaultStyle });
        });
      }
    }
    const pointList = AxisUtils.transformPlain2PointList(transformCuboid.frontPoints);
    DrawUtils.drawPolygonWithFill(this.canvas, pointList, { color: toolColor.valid.fill });
    DrawUtils.drawPolygon(this.canvas, pointList, { ...defaultStyle, isClose: true });

    let showText = '';
    if (this.isShowOrder && transformCuboid.order && transformCuboid?.order > 0) {
      showText = `${transformCuboid.order}`;
    }
    if (!hiddenText) {
      // DrawingText under the frontPlane.
      DrawUtils.drawText(
        this.canvas,
        { x: transformCuboid.frontPoints.tl.x, y: transformCuboid.frontPoints.tl.y - 5 },
        showText,
        {
          color: strokeColor,
          textMaxWidth: 300,
        },
      );
    }
  }

  public renderDrawing() {
    if (this.drawingCuboid) {
      this.renderSingleCuboid(this.drawingCuboid);
    }
  }

  public renderStatic() {
    this.cuboidList.forEach((cuboid) => this.renderSingleCuboid(cuboid));
  }

  public renderSelected() {
    const { selectedCuboid } = this;
    if (selectedCuboid) {
      this.renderSingleCuboid(selectedCuboid);
    }
  }

  /**
   * Notice: Hover is under selectedCuboid.
   */
  public renderHover() {
    if (this.dragInfo) {
      return;
    }
    this.highlightInfo?.forEach((data) => {
      const toolColor = this.getColor(data.originCuboid.attribute);
      const strokeColor = toolColor.valid.stroke;
      const thickness = 8;

      switch (data.type) {
        case 'point':
          data.points?.forEach((point) => {
            DrawUtils.drawCircleWithFill(
              this.canvas,
              AxisUtils.changePointByZoom(point, this.zoom, this.currentPos),
              thickness,
              {
                color: strokeColor,
              },
            );
          });

          // TODO - Update cursor
          break;
        case 'line': {
          const pointList = data.points?.map((point) => AxisUtils.changePointByZoom(point, this.zoom, this.currentPos));
          if (pointList) {
            DrawUtils.drawLineWithPointList(this.canvas, pointList, { color: strokeColor, thickness });
          }
          // TODO - Update cursor
          break;
        }
        default: {
          //
        }
      }
    });
  }

  public renderCuboid() {
    this.renderStatic();
    this.renderDrawing();
    this.renderSelected();
    this.renderHover();
  }

  public render() {
    if (!this.ctx) {
      return;
    }
    super.render();
    this.renderCuboid();
    this.renderCursorLine();
  }
}

export default CuboidOperation;
